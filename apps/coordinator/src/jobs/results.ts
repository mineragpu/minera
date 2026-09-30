import { keccak256, toBytes } from 'viem';
import type { Address } from '@minera/shared';
import { epochOf } from '../epoch.ts';
import type { Random } from '../random.ts';
import { bankAnswer, settleCanary } from '../sentinel/canary.ts';
import { SENTINEL_POLICY } from '../sentinel/policy.ts';
import { belowFloor, speedOf, withSample } from '../sentinel/speed.ts';
import { paidUnits, strike } from '../sentinel/standing.ts';
import type { JobRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { JOB_POLICY } from './policy.ts';
import { measureUnits } from './units.ts';
import { judge } from './verify.ts';

export interface SubmittedResult {
  nodeKey: Address;
  jobId: string;
  output: string;
  now: Date;
  epochSeconds: number;
  /** Tokens per second a rig must reach on the network's model. */
  speedFloor: number;
  random: Random;
}

export type ResultDecision =
  | { kind: 'accepted' }
  | { kind: 'closed'; reason: string }
  | { kind: 'not_found' }
  | { kind: 'not_assignee' };

function closedReason(job: JobRecord): string {
  return job.status === 'done'
    ? 'A result for this job was already received.'
    : 'This job was closed before the result arrived.';
}

/** Credit a rig's verified answer. Only visitors' prompts pay, weighted by the rig's standing. */
async function creditVerified(tx: Store, job: JobRecord, nodeKey: Address, units: number, epoch: number): Promise<void> {
  if (job.origin !== 'playground') return;
  const rig = await tx.rigs.get(nodeKey);
  await tx.work.credit(nodeKey, epoch, { verified: units, unverified: 0, paid: paidUnits(rig?.standing ?? 'probation', units) });
}

async function creditUnverified(tx: Store, job: JobRecord, nodeKey: Address, units: number, epoch: number): Promise<void> {
  if (job.origin === 'playground') await tx.work.credit(nodeKey, epoch, { verified: 0, unverified: units, paid: 0 });
}

/** Time the answer. A sample below the floor is a blocked pass through the proof of GPU gate. */
async function recordSpeed(tx: Store, job: JobRecord, nodeKey: Address, units: number, result: SubmittedResult): Promise<void> {
  if (job.kind !== 'chat' || job.assignedAt === null) return;
  const sample = speedOf(units, job.assignedAt, result.now);
  if (sample === null) return;
  const rig = await tx.rigs.get(nodeKey);
  if (!rig) return;
  const speedSamples = withSample(rig.speedSamples, sample);
  await tx.rigs.updateSentinel(nodeKey, { speedSamples });
  const slow = sample < result.speedFloor;
  await tx.sentinel.tally('gpu', slow && belowFloor(speedSamples, result.speedFloor) ? 'blocked' : 'passed', result.now);
}

/**
 * Put a disagreement to a third rig. It must share no operator, network or card with either rig
 * that answered, and until it returns neither answer is judged.
 */
async function openTiebreak(tx: Store, job: JobRecord, now: Date, random: Random): Promise<void> {
  await tx.jobs.insert({
    id: random.uuid(),
    groupId: job.groupId,
    kind: 'chat',
    origin: job.origin,
    originNetwork: job.originNetwork,
    canaryId: null,
    model: job.model,
    messages: job.messages,
    params: job.params,
    expected: null,
    targetNode: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SENTINEL_POLICY.tiebreakTtlSeconds * 1000),
  });
}

/**
 * Store a rig's result and settle what it proves, in one transaction.
 *
 * Only verified work on visitors' prompts is credited: a job whose twin, run by an unrelated rig,
 * returned the same output. When two rigs disagree, a third breaks the tie; the two that agree are
 * verified and the one that does not takes a strike. Work nobody compared is recorded as unverified
 * and earns nothing on its own. Checks and canaries decide a rig's standing and pay nothing.
 */
export async function acceptResult(store: Store, result: SubmittedResult): Promise<ResultDecision> {
  const { nodeKey, output, now, random } = result;
  return store.transaction(async (tx) => {
    const job = await tx.jobs.get(result.jobId);
    if (!job) return { kind: 'not_found' };
    if (job.assignedNode !== nodeKey) return { kind: 'not_assignee' };
    if (job.status !== 'assigned') return { kind: 'closed', reason: closedReason(job) };

    const units = measureUnits(output, job.params.maxTokens);
    const epoch = epochOf(now, result.epochSeconds);
    const group = await tx.jobs.group(job.groupId);
    const judgement = judge(job, output, group);
    const outputHash = keccak256(toBytes(output));
    const complete = (verification: JobRecord['verification'], verifiedAt: Date | null) =>
      tx.jobs.complete(job.id, { output, outputHash, units, verification, finishedAt: now, verifiedAt });
    await recordSpeed(tx, job, nodeKey, units, result);

    switch (judgement.type) {
      case 'check':
        await complete(judgement.passed ? 'verified' : 'failed', judgement.passed ? now : null);
        await tx.rigs.recordCheck(nodeKey, judgement.passed, now);
        break;
      case 'canary':
        await complete(judgement.passed ? 'verified' : 'failed', judgement.passed ? now : null);
        await settleCanary(tx, job, nodeKey, judgement.passed, now, result.epochSeconds);
        break;
      case 'await-twin':
        await complete('pending', null);
        if (judgement.twin.status === 'queued') {
          await tx.jobs.expireBy(judgement.twin.id, new Date(now.getTime() + JOB_POLICY.twinWaitSeconds * 1000));
        }
        break;
      case 'unchecked':
        await complete('unverified', null);
        await creditUnverified(tx, job, nodeKey, units, epoch);
        break;
      case 'twin': {
        const { twin, match } = judgement;
        if (!match) {
          await complete('pending', null);
          await openTiebreak(tx, job, now, random);
          break;
        }
        await complete('verified', now);
        await tx.jobs.setVerification(twin.id, 'verified', now);
        await tx.rigs.recordCheck(nodeKey, true, now);
        await creditVerified(tx, job, nodeKey, units, epoch);
        if (twin.assignedNode) {
          await tx.rigs.recordCheck(twin.assignedNode, true, now);
          await creditVerified(tx, twin, twin.assignedNode, twin.units ?? 0, epoch);
        }
        await tx.sentinel.tally('crosscheck', 'passed', now);
        if (job.origin === 'seed') await bankAnswer(tx, job, output, group, now, random);
        break;
      }
      case 'tiebreak': {
        const { winner, answered } = judgement;
        if (!winner) {
          // Three different answers point to nondeterminism, not to one bad rig.
          await complete('unverified', null);
          await creditUnverified(tx, job, nodeKey, units, epoch);
          for (const other of answered) await tx.jobs.setVerification(other.id, 'mismatch', null);
          break;
        }
        await complete('verified', now);
        await tx.jobs.setVerification(winner.id, 'verified', now);
        await tx.rigs.recordCheck(nodeKey, true, now);
        await creditVerified(tx, job, nodeKey, units, epoch);
        if (winner.assignedNode) {
          await tx.rigs.recordCheck(winner.assignedNode, true, now);
          await creditVerified(tx, winner, winner.assignedNode, winner.units ?? 0, epoch);
        }
        for (const loser of answered.filter((other) => other.id !== winner.id)) {
          await tx.jobs.setVerification(loser.id, 'mismatch', null);
          if (!loser.assignedNode) continue;
          await tx.rigs.recordCheck(loser.assignedNode, false, now);
          await strike(tx, loser.assignedNode, 'tiebreak_lost', now, result.epochSeconds);
          await tx.sentinel.tally('crosscheck', 'blocked', now);
        }
        await tx.sentinel.tally('crosscheck', 'passed', now);
        if (job.origin === 'seed') await bankAnswer(tx, job, output, group, now, random);
        break;
      }
    }
    return { kind: 'accepted' };
  });
}
