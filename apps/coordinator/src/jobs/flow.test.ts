import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import type { Address, JobAssignment } from '@minera/shared';
import { epochOf } from '../epoch.ts';
import { createMemoryStore } from '../store/memory/index.ts';
import type { RigRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { seededRandom } from '../testing/seededRandom.ts';
import { issueBenchmark } from './benchmark.ts';
import { assignJobs } from './dispatch.ts';
import { sweepJobs } from './janitor.ts';
import { JOB_POLICY } from './policy.ts';
import { submitPlaygroundJob } from './playground.ts';
import { viewPlaygroundJob } from './playgroundView.ts';
import { acceptResult } from './results.ts';

const MODEL = 'small-model';
const EPOCH_SECONDS = 3_600;
const T0 = new Date('2026-09-29T12:00:00Z');
const later = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const address = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
const OPERATOR_A = address(0xa);
const OPERATOR_B = address(0xb);
const OPERATOR_C = address(0xc);
const R1 = address(0x101);
const R2 = address(0x102);
const R3 = address(0x103);
const R4 = address(0x104);
const IDLE = { busy: false, queue: 0 };
const CHALLENGE_DUE = JOB_POLICY.challengeIntervalSeconds + 1;
const SINGLE = { model: MODEL, maxTokens: 64, redundancyRate: 0 };
const TWICE = { model: MODEL, maxTokens: 64, redundancyRate: 1 };

let store: Store;

async function rig(nodeKey: Address): Promise<RigRecord> {
  const found = await store.rigs.get(nodeKey);
  assert.ok(found);
  return found;
}

function answerTo(assignment: JobAssignment): string {
  const question = assignment.messages.find((message) => message.role === 'user')?.content ?? '';
  const [, a, operator, b] = /(\d+) (plus|minus|times) (\d+)/.exec(question) ?? [];
  const x = Number(a);
  const y = Number(b);
  return String(operator === 'plus' ? x + y : operator === 'minus' ? x - y : x * y);
}

async function submit(nodeKey: Address, jobId: string, output: string, now: Date) {
  const random = seededRandom(99);
  return acceptResult(store, { nodeKey, jobId, output, now, epochSeconds: EPOCH_SECONDS, speedFloor: 0, random });
}

async function qualify(nodeKey: Address, random = seededRandom(1)): Promise<void> {
  const benchmark = await issueBenchmark(store, await rig(nodeKey), MODEL, T0, random);
  assert.ok(benchmark);
  assert.deepEqual(await submit(nodeKey, benchmark.id, answerTo(benchmark), T0), { kind: 'accepted' });
}

async function heartbeat(nodeKey: Address, now: Date, random = seededRandom(2)): Promise<JobAssignment[]> {
  return assignJobs(store, await rig(nodeKey), IDLE, MODEL, now, random, 0);
}

beforeEach(async () => {
  store = createMemoryStore();
  const rigs = [[R1, OPERATOR_A], [R2, OPERATOR_A], [R3, OPERATOR_B], [R4, OPERATOR_C]] as const;
  for (const [nodeKey, operator] of rigs) {
    const name = `rig-${nodeKey.slice(-3)}`;
    await store.rigs.deploy({ nodeKey, operator, pair: address(0), name, deployedAt: T0, deployedBlock: 1n });
    const runtime = { runtime: 'local', models: [MODEL] };
    const network = `net-${nodeKey.slice(-3)}`;
    await store.rigs.recordHello(nodeKey, { clientVersion: '0.1.0', gpu: null, runtime, network }, T0);
  }
});

describe('job flow', () => {
  it('keeps open jobs from a rig until it passes its benchmark', async () => {
    const benchmark = await issueBenchmark(store, await rig(R1), MODEL, T0, seededRandom(3));
    assert.equal(benchmark?.kind, 'benchmark');
    assert.equal('expected' in (benchmark ?? {}), false);
    const id = await submitPlaygroundJob(store, SINGLE, 'Say hi', T0, seededRandom(4), null);
    assert.deepEqual(await heartbeat(R1, later(5)), []);

    assert.ok(benchmark);
    const passed = await submit(R1, benchmark.id, `The answer is ${answerTo(benchmark)}`, later(6));
    assert.deepEqual(passed, { kind: 'accepted' });
    assert.equal((await rig(R1)).checksPassed, 1);
    const [chat] = await heartbeat(R1, later(7));
    assert.ok(chat);
    assert.equal(chat.kind, 'chat');
    assert.notEqual(chat.id, id);
    assert.deepEqual(chat.params, { temperature: 0, seed: chat.params.seed, maxTokens: 64 });

    assert.deepEqual(await submit(R1, chat.id, 'Hi there.', later(8)), { kind: 'accepted' });
    const view = await viewPlaygroundJob(store, id);
    assert.deepEqual(
      [view?.status, view?.output, view?.verification, view?.crossChecked],
      ['done', 'Hi there.', 'unverified', false],
    );
    assert.equal(view?.rig?.nodeKey, R1);
    assert.deepEqual(await store.work.verifiedByRig(0, epochOf(later(8), EPOCH_SECONDS)), []);
  });

  it('verifies a job two operators answered the same, and credits both rigs', async () => {
    for (const nodeKey of [R1, R2, R3]) await qualify(nodeKey);
    const id = await submitPlaygroundJob(store, TWICE, 'Sky?', T0, seededRandom(5, { chance: true }), null);

    const [first] = await heartbeat(R1, later(1));
    assert.equal(first?.kind, 'chat');
    assert.deepEqual(await heartbeat(R2, later(1)), []);
    const [second] = await heartbeat(R3, later(1));
    assert.ok(first && second && first.id !== second.id);
    assert.equal(second.params.seed, first.params.seed);

    await submit(R1, first.id, 'The sky is blue.', later(2));
    const checking = await viewPlaygroundJob(store, id);
    assert.deepEqual([checking?.status, checking?.output, checking?.rig], ['checking', null, null]);
    assert.equal(checking?.verification, 'pending');
    await submit(R3, second.id, '  The sky is\nblue. ', later(3));

    const view = await viewPlaygroundJob(store, id);
    assert.deepEqual([view?.verification, view?.crossChecked, view?.output], ['verified', true, 'The sky is blue.']);
    const epoch = epochOf(later(3), EPOCH_SECONDS);
    // Both rigs are new and on probation, so they are paid half of their verified units.
    assert.deepEqual(await store.work.verifiedByRig(epoch, epoch), [
      { nodeKey: R1, operator: OPERATOR_A, verified: 4n, units: 2n },
      { nodeKey: R3, operator: OPERATOR_B, verified: 4n, units: 2n },
    ]);
  });

  it('settles a disagreement with a third rig and strikes only the rig that disagreed', async () => {
    for (const nodeKey of [R1, R3, R4]) await qualify(nodeKey);
    const id = await submitPlaygroundJob(store, TWICE, 'Sky?', T0, seededRandom(6, { chance: true }), null);
    const [first] = await heartbeat(R1, later(1));
    const [second] = await heartbeat(R3, later(1));
    assert.ok(first && second);
    await submit(R1, first.id, 'Blue.', later(2));
    await submit(R3, second.id, 'Green.', later(2));
    assert.deepEqual([(await viewPlaygroundJob(store, id))?.status, (await rig(R3)).checksFailed], ['checking', 0]);

    // The tiebreak never goes back to a rig that answered, nor to one of the same operator.
    assert.deepEqual(await heartbeat(R1, later(3)), []);
    assert.deepEqual(await heartbeat(R2, later(3)), []);
    const [third] = await heartbeat(R4, later(3));
    assert.ok(third);
    assert.deepEqual([third.messages, third.params], [first.messages, first.params]);
    await submit(R4, third.id, 'Blue.', later(4));

    const view = await viewPlaygroundJob(store, id);
    assert.deepEqual([view?.status, view?.verification, view?.output], ['done', 'verified', 'Blue.']);
    const failed = await Promise.all([R1, R3, R4].map(async (nodeKey) => (await rig(nodeKey)).checksFailed));
    assert.deepEqual(failed, [0, 1, 0]);
    assert.equal(await store.sentinel.strikesSince(R3, T0), 1);
    const epoch = epochOf(later(4), EPOCH_SECONDS);
    const paid = await store.work.verifiedByRig(epoch, epoch);
    assert.deepEqual(paid.map((entry) => entry.nodeKey), [R1, R4]);
  });

  it('strikes nobody when three rigs all disagree, and pays nobody', async () => {
    for (const nodeKey of [R1, R3, R4]) await qualify(nodeKey);
    await submitPlaygroundJob(store, TWICE, 'Sky?', T0, seededRandom(6, { chance: true }), null);
    const [first] = await heartbeat(R1, later(1));
    const [second] = await heartbeat(R3, later(1));
    assert.ok(first && second);
    await submit(R1, first.id, 'Blue.', later(2));
    await submit(R3, second.id, 'Green.', later(2));
    const [third] = await heartbeat(R4, later(3));
    assert.ok(third);
    await submit(R4, third.id, 'Gray.', later(4));
    for (const nodeKey of [R1, R3, R4]) assert.equal(await store.sentinel.strikesSince(nodeKey, T0), 0);
    assert.deepEqual(await store.work.verifiedByRig(0, 10_000_000), []);
  });

  it('fails a rig that answers a challenge wrongly', async () => {
    await qualify(R3);
    const [challenge] = await heartbeat(R3, later(CHALLENGE_DUE));
    assert.equal(challenge?.kind, 'challenge');
    assert.ok(challenge);
    await submit(R3, challenge.id, '-1', later(CHALLENGE_DUE + 1));
    assert.equal((await rig(R3)).checksFailed, 1);
    assert.deepEqual(await store.work.verifiedByRig(0, 10_000_000), []);
  });

  it('qualifies a rig that passes a challenge, without paying for it', async () => {
    const [challenge] = await heartbeat(R1, later(CHALLENGE_DUE));
    assert.equal(challenge?.kind, 'challenge');
    assert.ok(challenge);
    const passed = await submit(R1, challenge.id, answerTo(challenge), later(CHALLENGE_DUE + 1));
    assert.deepEqual(passed, { kind: 'accepted' });
    assert.notEqual((await rig(R1)).qualifiedAt, null);
    assert.deepEqual(await store.work.verifiedByRig(0, 10_000_000), []);
    assert.equal(await store.jobs.verifiedUnitsSince(T0), 0n);
  });

  it('refuses results from a rig that does not hold the job, and duplicates', async () => {
    await qualify(R1);
    const id = await submitPlaygroundJob(store, SINGLE, 'Hello', T0, seededRandom(7), null);
    const [queued] = await store.jobs.group(id);
    assert.ok(queued);
    assert.deepEqual(await submit(R1, queued.id, 'x', later(1)), { kind: 'not_assignee' });
    await heartbeat(R1, later(1));
    assert.deepEqual(await submit(R3, queued.id, 'x', later(2)), { kind: 'not_assignee' });
    assert.deepEqual(await submit(R1, 'missing', 'x', later(2)), { kind: 'not_found' });
    assert.deepEqual(await submit(R1, id, 'x', later(2)), { kind: 'not_found' });
    assert.deepEqual(await submit(R1, queued.id, 'x', later(2)), { kind: 'accepted' });
    assert.equal((await submit(R1, queued.id, 'x', later(3))).kind, 'closed');
  });

  it('requeues overdue jobs and leaves an answer unverified when its twin is dropped', async () => {
    for (const nodeKey of [R1, R3]) await qualify(nodeKey);
    const id = await submitPlaygroundJob(store, TWICE, 'Hi', T0, seededRandom(8, { chance: true }), null);
    const [first] = await heartbeat(R1, later(1));
    assert.ok(first);
    assert.deepEqual(await sweepJobs(store, later(122), EPOCH_SECONDS), { requeued: 1, expired: 0 });
    const [again] = await heartbeat(R1, later(123));
    assert.equal(again?.id, first.id);
    await submit(R1, first.id, 'Hello.', later(124));

    const twinGivesUp = 124 + JOB_POLICY.twinWaitSeconds + 1;
    assert.deepEqual(await sweepJobs(store, later(twinGivesUp), EPOCH_SECONDS), { requeued: 0, expired: 1 });
    const view = await viewPlaygroundJob(store, id);
    assert.deepEqual([view?.status, view?.verification, view?.crossChecked], ['done', 'unverified', false]);
  });
});
