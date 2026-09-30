import type { Address, RigStanding } from '@minera/shared';
import { checkModel } from '../jobs/checks.ts';
import { normalizeOutput } from '../jobs/normalize.ts';
import { PLAYGROUND_SYSTEM } from '../jobs/playground.ts';
import { JOB_POLICY, MAX_SEED } from '../jobs/policy.ts';
import type { Random } from '../random.ts';
import type { JobRecord, NewJob, RigRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { SENTINEL_POLICY } from './policy.ts';
import { seedPrompt } from './prompts.ts';
import { passCanary, strike } from './standing.ts';

const DRAWS = 1_000_000;

/** Seconds until a rig's next canary: exponential around its standing's mean, so none is predictable. */
export function canaryDelaySeconds(standing: RigStanding, random: Random): number {
  const mean = standing === 'trusted' ? SENTINEL_POLICY.canaryMeanSeconds.trusted : SENTINEL_POLICY.canaryMeanSeconds.probation;
  const uniform = (random.int(DRAWS) + 1) / (DRAWS + 1);
  const seconds = -mean * Math.log(uniform);
  return Math.min(SENTINEL_POLICY.canaryMaxSeconds, Math.max(SENTINEL_POLICY.canaryMinSeconds, Math.round(seconds)));
}

/**
 * Queue a canary for the rig when one is due and the bank holds one it has never seen. A canary
 * travels as an ordinary chat job; only the coordinator knows its answer. Resolves whether one was
 * queued.
 */
export async function canaryIfDue(
  tx: Store,
  rig: RigRecord,
  preferredModel: string,
  now: Date,
  random: Random,
): Promise<boolean> {
  if (rig.standing === 'quarantined') return false;
  if (rig.nextCanaryAt !== null && now < rig.nextCanaryAt) return false;
  const model = checkModel(rig, preferredModel);
  if (!model) return false;
  if ((await tx.jobs.openChecks(rig.nodeKey)).length > 0) return false;

  const next = new Date(now.getTime() + canaryDelaySeconds(rig.standing, random) * 1000);
  await tx.rigs.updateSentinel(rig.nodeKey, { nextCanaryAt: next });
  const canary = await tx.sentinel.pickCanary(model, rig.nodeKey, random);
  if (!canary) return false;

  const id = random.uuid();
  await tx.jobs.insert({
    id,
    groupId: id,
    kind: 'chat',
    origin: 'canary',
    originNetwork: null,
    canaryId: canary.id,
    model,
    messages: canary.messages,
    params: canary.params,
    expected: canary.answer,
    targetNode: rig.nodeKey,
    createdAt: now,
    expiresAt: new Date(now.getTime() + JOB_POLICY.checkTtlSeconds * 1000),
  });
  await tx.sentinel.markServed(canary.id, rig.nodeKey);
  return true;
}

/**
 * Whether an answer reproduces the agreed one. Only the leading characters are compared: they
 * cannot be produced without running the model, and they are where honest rigs on different cards
 * agree most reliably.
 */
export function passesCanary(output: string, answer: string): boolean {
  const length = Math.min(SENTINEL_POLICY.canaryPrefixChars, answer.length);
  return length > 0 && normalizeOutput(output).slice(0, length) === answer.slice(0, length);
}

/**
 * Settle a canary result. A pass counts toward trust and confirms the canary. A wrong answer to a
 * confirmed canary is a strike; a canary nobody has confirmed yet only takes a dispute, so a bad
 * bank entry can never strike an honest rig, and one that keeps being disputed is retired.
 */
export async function settleCanary(
  tx: Store,
  job: JobRecord,
  nodeKey: Address,
  passed: boolean,
  now: Date,
  epochSeconds: number,
): Promise<void> {
  const canary = job.canaryId === null ? null : await tx.sentinel.getCanary(job.canaryId);
  if (passed) {
    if (canary) await tx.sentinel.confirm(canary.id);
    await passCanary(tx, nodeKey, now);
    await tx.rigs.recordCheck(nodeKey, true, now);
    await tx.sentinel.tally('canary', 'passed', now);
    return;
  }
  if (!canary) return;
  if (canary.confirmations > 0) {
    await tx.rigs.recordCheck(nodeKey, false, now);
    await strike(tx, nodeKey, 'canary_failed', now, epochSeconds);
    await tx.sentinel.tally('canary', 'blocked', now);
    return;
  }
  await tx.sentinel.dispute(canary.id);
  if (canary.disputes + 1 >= SENTINEL_POLICY.canaryRetireDisputes) await tx.sentinel.retire(canary.id);
}

/** A canary the rig took and let run out while it was still online counts as failed. */
export async function missCanary(tx: Store, job: JobRecord, now: Date, epochSeconds: number): Promise<void> {
  if (job.assignedNode === null) return;
  await tx.rigs.recordCheck(job.assignedNode, false, now);
  await strike(tx, job.assignedNode, 'canary_missed', now, epochSeconds);
  await tx.sentinel.tally('canary', 'blocked', now);
}

/** Keep an answer two or three independent rigs agreed on as a canary for every other rig. */
export async function bankAnswer(
  tx: Store,
  job: JobRecord,
  output: string,
  group: readonly JobRecord[],
  now: Date,
  random: Random,
): Promise<void> {
  const answer = normalizeOutput(output);
  if (answer.length === 0) return;
  const sources = [...new Set(group.flatMap((member) => (member.assignedNode === null ? [] : [member.assignedNode])))];
  await tx.sentinel.addCanary({
    id: random.uuid(),
    model: job.model,
    messages: job.messages,
    params: job.params,
    answer,
    sources,
    createdAt: now,
  });
}

/**
 * Queue a pair of seed prompts while the bank is short. Seeds are cross-checked like visitors'
 * prompts and pay nothing; an answer two independent rigs agree on becomes a canary. Resolves the
 * number of pairs queued.
 */
export async function seedCanaries(
  store: Store,
  playground: { model: string; maxTokens: number },
  now: Date,
  random: Random,
): Promise<number> {
  const { model, maxTokens } = playground;
  return store.transaction(async (tx) => {
    if ((await tx.sentinel.canaryCount(model)) >= SENTINEL_POLICY.bankTarget) return 0;
    if ((await tx.jobs.openCount('seed')) >= SENTINEL_POLICY.seedsInFlight * 2) return 0;
    const groupId = random.uuid();
    const seed: NewJob = {
      id: random.uuid(),
      groupId,
      kind: 'chat',
      origin: 'seed',
      originNetwork: null,
      canaryId: null,
      model,
      messages: [
        { role: 'system', content: PLAYGROUND_SYSTEM },
        { role: 'user', content: seedPrompt(random) },
      ],
      params: { temperature: 0, seed: random.int(MAX_SEED), maxTokens },
      expected: null,
      targetNode: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SENTINEL_POLICY.seedTtlSeconds * 1000),
    };
    await tx.jobs.insert(seed);
    await tx.jobs.insert({ ...seed, id: random.uuid() });
    return 1;
  });
}
