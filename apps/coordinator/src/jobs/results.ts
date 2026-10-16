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
  /**
   * The most paid units one prompt source's network, and one pair of rigs that verify each other,
   * can earn per epoch. 0 or absent means no limit.
   */
  limits?: WorkLimits;
}

export interface WorkLimits {
  perOrigin: number;
  perPair: number;
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

interface VerifiedAnswer {
  job: JobRecord;
  nodeKey: Address | null;
  units: number;
}

/**
 * How many of `want` paid units the epoch's limits still allow: one prompt source's network, and
 * one pair of rigs, can each earn only so much per epoch. The grant counts against every limit.
 */
async function grantPaid(tx: Store, job: JobRecord, pair: readonly Address[], want: bigint, epoch: number, limits: WorkLimits): Promise<bigint> {
  const keys: [string, bigint][] = [];
  if (limits.perOrigin > 0) keys.push([`origin:${job.originNetwork ?? 'unknown'}`, BigInt(limits.perOrigin)]);
  if (limits.perPair > 0 && pair.length === 2) keys.push([`pair:${[...pair].sort().join(':')}`, BigInt(limits.perPair)]);
  let grant = want;
  for (const [key, limit] of keys) {
    const used = await tx.work.limitUsed(key, epoch);
    const left = limit > used ? limit - used : 0n;
    if (left < grant) grant = left;
  }
  if (grant > 0n) for (const [key] of keys) await tx.work.useLimit(key, epoch, grant);
  return grant;
}

/**
 * Credit two rigs whose answers agreed. Only visitors' prompts pay: each rig's units are weighed by
 * its standing, then the pair's total is held to the epoch's limits and shared back in proportion.
 * Verified units are always recorded in full.
 */
async function creditVerifiedPair(tx: Store, epoch: number, limits: WorkLimits, answers: readonly VerifiedAnswer[]): Promise<void> {
  const credited = answers.filter((answer): answer is VerifiedAnswer & { nodeKey: Address } => answer.nodeKey !== null);
  if (credited.length === 0 || credited[0]!.job.origin !== 'playground') return;
  const weights: bigint[] = [];
  for (const answer of credited) {
    const rig = await tx.rigs.get(answer.nodeKey);
    weights.push(BigInt(paidUnits(rig?.standing ?? 'probation', answer.units)));
  }
  const want = weights.reduce((sum, weight) => sum + weight, 0n);
  const grant = want > 0n ? await grantPaid(tx, credited[0]!.job, credited.map((answer) => answer.nodeKey), want, epoch, limits) : 0n;
  let left = grant;
  for (const [i, answer] of credited.entries()) {
    const paid = i === credited.length - 1 ? left : (grant * weights[i]!) / want;
    left -= paid;
    await tx.work.credit(answer.nodeKey, epoch, { verified: answer.units, unverified: 0, paid: Number(paid) });
  }
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
  const limits: WorkLimits = result.limits ?? { perOrigin: 0, perPair: 0 };
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
        if (twin.assignedNode) await tx.rigs.recordCheck(twin.assignedNode, true, now);
        await creditVerifiedPair(tx, epoch, limits, [
          { job, nodeKey, units },
          { job: twin, nodeKey: twin.assignedNode, units: twin.units ?? 0 },
        ]);
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
        if (winner.assignedNode) await tx.rigs.recordCheck(winner.assignedNode, true, now);
        await creditVerifiedPair(tx, epoch, limits, [
          { job, nodeKey, units },
          { job: winner, nodeKey: winner.assignedNode, units: winner.units ?? 0 },
        ]);
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
