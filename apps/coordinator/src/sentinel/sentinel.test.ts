import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import type { Address, JobAssignment } from '@minera/shared';
import { epochOf } from '../epoch.ts';
import { issueBenchmark } from '../jobs/benchmark.ts';
import { assignJobs } from '../jobs/dispatch.ts';
import { sweepJobs } from '../jobs/janitor.ts';
import { submitPlaygroundJob } from '../jobs/playground.ts';
import { acceptResult } from '../jobs/results.ts';
import { createMemoryStore } from '../store/memory/index.ts';
import type { RigRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { seededRandom } from '../testing/seededRandom.ts';
import { canaryDelaySeconds, passesCanary, seedCanaries } from './canary.ts';
import { SENTINEL_POLICY } from './policy.ts';
import { belowFloor, speedOf } from './speed.ts';
import { paidUnits } from './standing.ts';

const MODEL = 'small-model';
const PLAYGROUND = { model: MODEL, maxTokens: 64 };
const EPOCH_SECONDS = 3_600;
const FLOOR = 40;
const T0 = new Date('2026-09-29T12:00:00Z');
const later = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const address = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
const RIGS = [address(0x201), address(0x202), address(0x203), address(0x204)] as const;
const [R1, R2, R3, R4] = RIGS;
const IDLE = { busy: false, queue: 0 };
const ANSWER = 'Honeybees dance to show each other where the flowers are, and the angle points the way.';

let store: Store;
let clock = 0;

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
  const random = seededRandom(clock++);
  return acceptResult(store, { nodeKey, jobId, output, now, epochSeconds: EPOCH_SECONDS, speedFloor: FLOOR, random });
}

async function heartbeat(nodeKey: Address, now: Date): Promise<JobAssignment[]> {
  return assignJobs(store, await rig(nodeKey), IDLE, MODEL, now, seededRandom(clock++), FLOOR);
}

async function qualify(nodeKey: Address): Promise<void> {
  const benchmark = await issueBenchmark(store, await rig(nodeKey), MODEL, T0, seededRandom(clock++));
  assert.ok(benchmark);
  await submit(nodeKey, benchmark.id, answerTo(benchmark), T0);
}

/** Two independent rigs answer a seed alike, so it becomes a canary for everyone else. */
async function bankOneCanary(now: Date): Promise<void> {
  assert.equal(await seedCanaries(store, PLAYGROUND, now, seededRandom(clock++)), 1);
  const [first] = await heartbeat(R1, now);
  const [second] = await heartbeat(R2, now);
  assert.ok(first && second);
  await submit(R1, first.id, ANSWER, now);
  await submit(R2, second.id, ANSWER, now);
}

async function canaryFor(nodeKey: Address, now: Date): Promise<JobAssignment> {
  await store.rigs.updateSentinel(nodeKey, { nextCanaryAt: null });
  const assigned = await heartbeat(nodeKey, now);
  const canary = assigned.find((job) => job.kind === 'chat');
  assert.ok(canary, 'a canary was handed out');
  return canary;
}

beforeEach(async () => {
  store = createMemoryStore();
  for (const [i, nodeKey] of RIGS.entries()) {
    const operator = address(0xa0 + i);
    await store.rigs.deploy({ nodeKey, operator, pair: address(0), name: `rig-${i}`, deployedAt: T0, deployedBlock: 1n });
    const runtime = { runtime: 'local', models: [MODEL] };
    const gpu = { model: 'card', vramMb: 8_192, uuid: `GPU-card-${i}` };
    await store.rigs.recordHello(nodeKey, { clientVersion: '0.1.0', gpu, runtime, network: `net-${i}` }, T0);
    await qualify(nodeKey);
    // No canaries during setup; each test asks for them explicitly.
    await store.rigs.updateSentinel(nodeKey, { nextCanaryAt: later(1_000_000) });
  }
});

describe('canaries', () => {
  it('banks the answer two independent rigs gave a seed, paying nothing for the seed', async () => {
    await bankOneCanary(later(5));
    assert.equal(await store.sentinel.canaryCount(MODEL), 1);
    assert.deepEqual(await store.work.verifiedByRig(0, 10_000_000), []);
    const canary = await store.sentinel.pickCanary(MODEL, R3, seededRandom(1));
    assert.ok(canary);
    assert.deepEqual([...canary.sources].sort(), [R1, R2]);
    assert.equal(canary.answer, ANSWER);
    assert.equal(await store.sentinel.pickCanary(MODEL, R1, seededRandom(1)), null, 'never checks a source');
  });

  it('stops seeding once enough seeds are in flight', async () => {
    const random = seededRandom(3);
    for (let i = 0; i < SENTINEL_POLICY.seedsInFlight; i += 1) assert.equal(await seedCanaries(store, PLAYGROUND, T0, random), 1);
    assert.equal(await seedCanaries(store, PLAYGROUND, T0, random), 0);
  });

  it('sends a canary as an ordinary chat job with the playground settings', async () => {
    await bankOneCanary(later(5));
    const canary = await canaryFor(R3, later(10));
    const prompt = await submitPlaygroundJob(store, { ...PLAYGROUND, redundancyRate: 0 }, 'Hi', later(10), seededRandom(4), null);
    assert.ok(prompt);
    assert.deepEqual(Object.keys(canary).sort(), ['deadlineSeconds', 'id', 'kind', 'messages', 'model', 'params']);
    assert.equal(canary.kind, 'chat');
    assert.equal(canary.params.maxTokens, PLAYGROUND.maxTokens);
    assert.equal(canary.messages[0]?.content, 'You are a helpful assistant. Answer clearly and briefly.');
  });

  it('counts a pass toward trust, confirms the canary, and pays nothing for it', async () => {
    await bankOneCanary(later(5));
    const canary = await canaryFor(R3, later(10));
    await submit(R3, canary.id, `${ANSWER} And more after the part that is compared.`, later(11));
    const r3 = await rig(R3);
    assert.deepEqual([r3.canariesPassed, r3.standing], [1, 'probation']);
    const bank = await store.sentinel.pickCanary(MODEL, R4, seededRandom(1));
    assert.equal(bank?.confirmations, 1);
    assert.deepEqual(await store.work.verifiedByRig(0, 10_000_000), []);
  });

  it('only disputes an unconfirmed canary, and retires one that keeps being disputed', async () => {
    await bankOneCanary(later(5));
    const first = await canaryFor(R3, later(10));
    await submit(R3, first.id, 'Something else entirely.', later(11));
    assert.equal(await store.sentinel.strikesSince(R3, T0), 0);
    const second = await canaryFor(R4, later(12));
    await submit(R4, second.id, 'Another different answer.', later(13));
    assert.equal(await store.sentinel.strikesSince(R4, T0), 0);
    assert.equal(await store.sentinel.canaryCount(MODEL), 0);
  });

  it('strikes a wrong answer to a confirmed canary', async () => {
    await bankOneCanary(later(5));
    const confirmedBy = await canaryFor(R3, later(10));
    await submit(R3, confirmedBy.id, ANSWER, later(11));
    const canary = await canaryFor(R4, later(12));
    await submit(R4, canary.id, 'A script guessing.', later(13));
    assert.equal(await store.sentinel.strikesSince(R4, T0), 1);
    assert.equal((await rig(R4)).qualifiedAt, null);
  });

  it('never lets a poisoned bank entry strike an honest rig', async () => {
    // Two colluding rigs on separate networks agree on junk for a seed, so it enters the bank.
    await bankOneCanary(later(5));
    const poisoned = await store.sentinel.pickCanary(MODEL, R3, seededRandom(1));
    assert.ok(poisoned);
    assert.deepEqual(await store.work.verifiedByRig(0, 10_000_000), [], 'colluding on a seed earns nothing');

    for (const [i, honest] of [R3, R4].entries()) {
      const canary = await canaryFor(honest, later(10 + i * 10));
      await submit(honest, canary.id, 'An honest answer from the real model.', later(11 + i * 10));
      assert.equal(await store.sentinel.strikesSince(honest, T0), 0);
      assert.equal((await rig(honest)).standing, 'probation');
    }
    assert.equal(await store.sentinel.getCanary(poisoned.id), null, 'retired after two disputes');
    const gates = await store.sentinel.gateCounts(T0);
    assert.deepEqual(
      gates.filter((entry) => entry.gate === 'canary' || entry.gate === 'reputation').map((entry) => entry.blocked),
      [0, 0],
    );
    assert.equal(await store.sentinel.pickCanary(MODEL, R1, seededRandom(1)), null, 'sources never get their own');
  });

  it('judges by the start of the answer only', () => {
    assert.equal(passesCanary(`  ${ANSWER.slice(0, 70)}   drifted later`, ANSWER), true);
    assert.equal(passesCanary(ANSWER.slice(0, 40), ANSWER), false);
    assert.equal(passesCanary('Short.', 'Short.'), true);
    assert.equal(passesCanary('', ''), false);
  });

  it('draws unpredictable intervals within the bounds, shorter on probation', () => {
    const random = seededRandom(11);
    const draws = (standing: 'probation' | 'trusted') =>
      Array.from({ length: 400 }, () => canaryDelaySeconds(standing, random));
    const probation = draws('probation');
    const trusted = draws('trusted');
    for (const seconds of [...probation, ...trusted]) {
      assert.ok(seconds >= SENTINEL_POLICY.canaryMinSeconds && seconds <= SENTINEL_POLICY.canaryMaxSeconds);
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    assert.ok(mean(probation) < mean(trusted));
    assert.ok(new Set(probation).size > 100);
  });
});

describe('standing', () => {
  it('trusts a rig after five canaries in a row and then pays it in full', async () => {
    for (let i = 0; i < SENTINEL_POLICY.probationCanaries; i += 1) {
      await store.sentinel.addCanary({
        id: `00000000-0000-4000-9000-00000000000${i}`,
        model: MODEL,
        messages: [{ role: 'user', content: `question ${i}` }],
        params: { temperature: 0, seed: i, maxTokens: 64 },
        answer: `answer number ${i}`,
        sources: [R1, R2],
        createdAt: T0,
      });
    }
    for (let i = 0; i < SENTINEL_POLICY.probationCanaries; i += 1) {
      const canary = await canaryFor(R3, later(10 + i * 10));
      const question = canary.messages.find((message) => message.role === 'user')?.content ?? '';
      await submit(R3, canary.id, `answer number ${question.slice(-1)}`, later(11 + i * 10));
    }
    assert.equal((await rig(R3)).standing, 'trusted');
    const reputation = (await store.sentinel.gateCounts(T0)).find((entry) => entry.gate === 'reputation');
    assert.deepEqual(reputation, { gate: 'reputation', passed: 1, blocked: 0 });
    assert.deepEqual([paidUnits('trusted', 9), paidUnits('probation', 9), paidUnits('quarantined', 9)], [9, 4, 0]);
  });

  it('quarantines a rig after three strikes, withholds its epoch, then returns it on probation', async () => {
    const now = later(60);
    await store.work.credit(R4, epochOf(now, EPOCH_SECONDS), { verified: 10, unverified: 0, paid: 5 });
    await store.rigs.updateSentinel(R4, { canariesPassed: 3 });
    const prompt = { model: MODEL, maxTokens: 64, redundancyRate: 1 };
    for (let i = 0; i < SENTINEL_POLICY.strikesToQuarantine; i += 1) {
      // Losing a tiebreak also withdraws open work until the rig passes a check again.
      if (i > 0) await qualify(R4);
      await submitPlaygroundJob(store, prompt, `Question ${i}?`, now, seededRandom(40 + i, { chance: true }), null);
      const [a] = await heartbeat(R1, now);
      const [b] = await heartbeat(R4, now);
      assert.ok(a && b);
      await submit(R1, a.id, 'Right.', now);
      await submit(R4, b.id, `Wrong ${i}.`, now);
      const [c] = await heartbeat(R2, now);
      assert.ok(c);
      await submit(R2, c.id, 'Right.', now);
      if (i === 0) assert.equal((await rig(R4)).canariesPassed, 0, 'a strike resets the probation count');
    }
    const held = await rig(R4);
    assert.equal(held.standing, 'quarantined');
    assert.deepEqual(await heartbeat(R4, later(61)), []);
    const epoch = epochOf(now, EPOCH_SECONDS);
    assert.equal((await store.work.verifiedByRig(epoch, epoch)).some((entry) => entry.nodeKey === R4), false);

    const after = new Date(now.getTime() + SENTINEL_POLICY.quarantineSeconds * 1000 + 1);
    await heartbeat(R4, after);
    const back = await rig(R4);
    assert.deepEqual([back.standing, back.canariesPassed, back.quarantinedUntil], ['probation', 0, null]);
  });
});

describe('proof of GPU', () => {
  it('times answers and keeps a rig that is too slow from open work, but not from checks', async () => {
    assert.equal(speedOf(10, T0, later(1)), null, 'short answers are not timed');
    assert.equal(speedOf(64, T0, later(2)), 32);
    assert.equal(speedOf(64, T0, T0), 256, 'time is floored');
    assert.equal(belowFloor([10, 12], FLOOR), false, 'too few samples decide nothing');
    assert.equal(belowFloor([10, 12, 50], FLOOR), false);
    assert.equal(belowFloor([10, 12, 14], FLOOR), true);

    await store.rigs.updateSentinel(R3, { speedSamples: [5, 6, 7] });
    await submitPlaygroundJob(store, { ...PLAYGROUND, redundancyRate: 0 }, 'Hi', later(5), seededRandom(7), null);
    assert.deepEqual(await heartbeat(R3, later(6)), []);
    const [job] = await heartbeat(R4, later(6));
    assert.ok(job);

    await submit(R4, job.id, 'x'.repeat(256), later(7));
    assert.deepEqual((await rig(R4)).speedSamples, [64]);
  });
});

describe('abandoned work', () => {
  it('strikes a rig that stayed online and sat on a job, not one that went offline', async () => {
    const prompt = { ...PLAYGROUND, redundancyRate: 0 };
    await submitPlaygroundJob(store, prompt, 'One?', T0, seededRandom(21), null);
    const [held] = await heartbeat(R1, later(1));
    assert.ok(held);
    await store.rigs.recordHeartbeat(R1, { runtime: 'local', models: [MODEL] }, 'net-0', later(200));
    await sweepJobs(store, later(201), EPOCH_SECONDS);
    assert.equal(await store.sentinel.strikesSince(R1, T0), 1);

    await submitPlaygroundJob(store, prompt, 'Two?', later(300), seededRandom(22), null);
    const [dropped] = await heartbeat(R2, later(301));
    assert.ok(dropped);
    await sweepJobs(store, later(500), EPOCH_SECONDS);
    assert.equal(await store.sentinel.strikesSince(R2, T0), 0);
  });

  it('counts a canary let run out while online as a miss', async () => {
    await bankOneCanary(later(5));
    const canary = await canaryFor(R3, later(10));
    assert.ok(canary);
    await store.rigs.recordHeartbeat(R3, { runtime: 'local', models: [MODEL] }, 'net-2', later(200));
    await sweepJobs(store, later(201), EPOCH_SECONDS);
    assert.equal(await store.sentinel.strikesSince(R3, T0), 1);
    const canaryGate = (await store.sentinel.gateCounts(T0)).find((entry) => entry.gate === 'canary');
    assert.equal(canaryGate?.blocked, 1);
  });
});
