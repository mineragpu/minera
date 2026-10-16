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
import { submitPlaygroundJob } from './playground.ts';
import { acceptResult, type WorkLimits } from './results.ts';

const MODEL = 'small-model';
const EPOCH_SECONDS = 3_600;
const T0 = new Date('2026-09-29T12:00:00Z');
const later = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const address = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
const R1 = address(0x101);
const R3 = address(0x103);
const IDLE = { busy: false, queue: 0 };
const TWICE = { model: MODEL, maxTokens: 64, redundancyRate: 1 };
/** 40 characters: 10 units, so 5 paid units for a rig on probation. */
const ANSWER = 'The sky is blue on a clear day, mostly..';
const NONE: WorkLimits = { perOrigin: 0, perPair: 0 };

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

async function submit(nodeKey: Address, jobId: string, output: string, now: Date, limits: WorkLimits) {
  return acceptResult(store, { nodeKey, jobId, output, now, epochSeconds: EPOCH_SECONDS, speedFloor: 0, random: seededRandom(99), limits });
}

/** One prompt from `origin`, answered the same by both rigs. */
async function verifiedPrompt(at: number, origin: string, limits: WorkLimits): Promise<void> {
  await submitPlaygroundJob(store, TWICE, `Sky ${at}?`, later(at), seededRandom(at, { chance: true }), origin);
  const [first] = await assignJobs(store, await rig(R1), IDLE, MODEL, later(at + 1), seededRandom(at + 1), 0);
  const [second] = await assignJobs(store, await rig(R3), IDLE, MODEL, later(at + 1), seededRandom(at + 2), 0);
  assert.ok(first && second, 'both rigs take a copy');
  await submit(R1, first.id, ANSWER, later(at + 2), limits);
  await submit(R3, second.id, ANSWER, later(at + 3), limits);
}

async function paid(): Promise<Record<string, [bigint, bigint]>> {
  const epoch = epochOf(T0, EPOCH_SECONDS);
  const work = await store.work.verifiedByRig(epoch, epoch);
  const byRig: Record<string, [bigint, bigint]> = {};
  for (const entry of work) byRig[entry.nodeKey] = [entry.verified, entry.units];
  return byRig;
}

beforeEach(async () => {
  store = createMemoryStore();
  for (const [nodeKey, operator] of [[R1, address(0xa)], [R3, address(0xb)]] as const) {
    await store.rigs.deploy({ nodeKey, operator, pair: address(0), name: `rig-${nodeKey.slice(-3)}`, deployedAt: T0, deployedBlock: 1n });
    await store.rigs.recordHello(nodeKey, { clientVersion: '0.1.0', gpu: null, runtime: { runtime: 'local', models: [MODEL] }, network: `net-${nodeKey.slice(-3)}` }, T0);
    const benchmark = await issueBenchmark(store, await rig(nodeKey), MODEL, T0, seededRandom(1));
    assert.ok(benchmark);
    await submit(nodeKey, benchmark.id, answerTo(benchmark), T0, NONE);
  }
});

describe('paid work limits', () => {
  it('pay a verified pair in full when no limit is set', async () => {
    await verifiedPrompt(10, 'origin-1', NONE);
    await verifiedPrompt(20, 'origin-1', NONE);
    assert.deepEqual(await paid(), { [R1]: [20n, 10n], [R3]: [20n, 10n] });
  });

  it('hold one pair of rigs to its limit per epoch, and keep counting their verified work', async () => {
    const limits = { perOrigin: 0, perPair: 15 };
    await verifiedPrompt(10, 'origin-1', limits);
    await verifiedPrompt(20, 'origin-2', limits);
    await verifiedPrompt(30, 'origin-3', limits);
    // 10 paid units for the first prompt, the 5 left for the second, none for the third.
    const byRig = await paid();
    assert.deepEqual([byRig[R1]?.[0], byRig[R3]?.[0]], [30n, 30n]);
    assert.equal((byRig[R1]?.[1] ?? 0n) + (byRig[R3]?.[1] ?? 0n), 15n);
  });

  it('hold the prompts of one network to its limit per epoch, and not another network\'s', async () => {
    const limits = { perOrigin: 10, perPair: 0 };
    await verifiedPrompt(10, 'origin-1', limits);
    await verifiedPrompt(20, 'origin-1', limits);
    assert.deepEqual(await paid(), { [R1]: [20n, 5n], [R3]: [20n, 5n] });
    await verifiedPrompt(30, 'origin-2', limits);
    assert.deepEqual(await paid(), { [R1]: [30n, 10n], [R3]: [30n, 10n] });
  });
});
