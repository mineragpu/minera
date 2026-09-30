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
const R1 = address(0x101);
const R2 = address(0x102);
const R3 = address(0x103);
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
  return acceptResult(store, { nodeKey, jobId, output, now, epochSeconds: EPOCH_SECONDS });
}

async function qualify(nodeKey: Address, random = seededRandom(1)): Promise<void> {
  const benchmark = await issueBenchmark(store, await rig(nodeKey), MODEL, T0, random);
  assert.ok(benchmark);
  assert.deepEqual(await submit(nodeKey, benchmark.id, answerTo(benchmark), T0), { kind: 'accepted' });
}

async function heartbeat(nodeKey: Address, now: Date, random = seededRandom(2)): Promise<JobAssignment[]> {
  return assignJobs(store, await rig(nodeKey), IDLE, MODEL, now, random);
}

beforeEach(async () => {
  store = createMemoryStore();
  for (const [nodeKey, operator] of [[R1, OPERATOR_A], [R2, OPERATOR_A], [R3, OPERATOR_B]] as const) {
    const name = `rig-${nodeKey.slice(-3)}`;
    await store.rigs.deploy({ nodeKey, operator, pair: address(0), name, deployedAt: T0, deployedBlock: 1n });
    const runtime = { runtime: 'local', models: [MODEL] };
    await store.rigs.recordHello(nodeKey, { clientVersion: '0.1.0', gpu: null, runtime }, T0);
  }
});

describe('job flow', () => {
  it('keeps open jobs from a rig until it passes its benchmark', async () => {
    const benchmark = await issueBenchmark(store, await rig(R1), MODEL, T0, seededRandom(3));
    assert.equal(benchmark?.kind, 'benchmark');
    assert.equal('expected' in (benchmark ?? {}), false);
    const id = await submitPlaygroundJob(store, SINGLE, 'Say hi', T0, seededRandom(4));
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
    const id = await submitPlaygroundJob(store, TWICE, 'Sky?', T0, seededRandom(5, { chance: true }));

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
    assert.deepEqual(await store.work.verifiedByRig(epoch, epoch), [
      { nodeKey: R1, operator: OPERATOR_A, units: 4n },
      { nodeKey: R3, operator: OPERATOR_B, units: 4n },
    ]);
  });

  it('pays nothing for a disagreement or a wrong answer, and counts both against the rigs', async () => {
    for (const nodeKey of [R1, R3]) await qualify(nodeKey);
    const id = await submitPlaygroundJob(store, TWICE, 'Sky?', T0, seededRandom(6, { chance: true }));
    const [first] = await heartbeat(R1, later(1));
    const [second] = await heartbeat(R3, later(1));
    assert.ok(first && second);
    await submit(R1, first.id, 'Blue.', later(2));
    await submit(R3, second.id, 'Green.', later(2));
    assert.equal((await viewPlaygroundJob(store, id))?.verification, 'mismatch');
    assert.deepEqual([(await rig(R1)).checksFailed, (await rig(R3)).checksFailed], [1, 1]);
    await submitPlaygroundJob(store, SINGLE, 'Again?', later(3), seededRandom(9));
    assert.deepEqual(await heartbeat(R1, later(4)), []);

    const [challenge] = await heartbeat(R3, later(CHALLENGE_DUE));
    assert.equal(challenge?.kind, 'challenge');
    assert.ok(challenge);
    await submit(R3, challenge.id, '-1', later(CHALLENGE_DUE + 1));
    assert.equal((await rig(R3)).checksFailed, 2);
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
    const id = await submitPlaygroundJob(store, SINGLE, 'Hello', T0, seededRandom(7));
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
    const id = await submitPlaygroundJob(store, TWICE, 'Hi', T0, seededRandom(8, { chance: true }));
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
