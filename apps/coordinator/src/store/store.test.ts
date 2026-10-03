import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import postgres from 'postgres';
import type { Address, Hex } from '@minera/shared';
import { migrate } from '../db/migrate.ts';
import { createMemoryStore } from './memory/index.ts';
import { createPostgresStore } from './postgres/index.ts';
import { seededRandom } from '../testing/seededRandom.ts';
import type { NewJob, RigListQuery, SettlementDraft, TreeDump } from './records.ts';
import type { Store } from './store.ts';

const address = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const at = (minutes: number): Date => new Date(Date.UTC(2026, 8, 29, 12, minutes));

const ETH = address(0);
const STOCK = address(0x5eed);
const OPERATOR_A = address(0xa);
const OPERATOR_B = address(0xb);
const RIG_1 = address(0x1001);
const RIG_2 = address(0x1002);
const RIG_3 = address(0x1003);
const RIG_4 = address(0x1004);
const RIG_5 = address(0x1005);
const OPERATOR_C = address(0xc);
const OPERATOR_D = address(0xd);
const RUNTIME = { runtime: 'local', version: '1.0.0', models: ['small-model'] };

async function deployRigs(store: Store): Promise<void> {
  const rigs = [
    { nodeKey: RIG_1, operator: OPERATOR_A, pair: ETH, name: 'one', deployedAt: at(0), deployedBlock: 10n },
    { nodeKey: RIG_2, operator: OPERATOR_A, pair: STOCK, name: 'two', deployedAt: at(1), deployedBlock: 11n },
    { nodeKey: RIG_3, operator: OPERATOR_B, pair: ETH, name: 'three', deployedAt: at(2), deployedBlock: 12n },
  ];
  for (const rig of rigs) await store.rigs.deploy(rig);
  for (const nodeKey of [RIG_1, RIG_2, RIG_3]) {
    const gpu = { model: 'card', vramMb: 8_192, uuid: `GPU-${nodeKey.slice(-4)}` };
    const report = { clientVersion: '0.1.0', gpu, runtime: RUNTIME, network: `net-${nodeKey.slice(-4)}` };
    await store.rigs.recordHello(nodeKey, report, at(3));
  }
}

function job(overrides: Partial<NewJob> = {}): NewJob {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    groupId: id,
    kind: 'chat',
    origin: overrides.kind === undefined || overrides.kind === 'chat' ? 'playground' : 'check',
    originNetwork: null,
    canaryId: null,
    model: 'small-model',
    messages: [{ role: 'user', content: 'hello' }],
    params: { temperature: 0, seed: 7, maxTokens: 64 },
    expected: null,
    targetNode: null,
    createdAt: at(5),
    expiresAt: at(30),
    ...overrides,
  };
}

const DUMP = {
  format: 'standard-v1',
  leafEncoding: ['address', 'uint256'],
  tree: [hash(1)],
  values: [],
} as unknown as TreeDump;

function draft(overrides: Partial<SettlementDraft> = {}): SettlementDraft {
  return {
    root: hash(0xabc),
    total: 1_000n,
    inputsDigest: hash(0xdef),
    inputs: '{"version":1}',
    dump: DUMP,
    previousIndex: 0,
    fromEpoch: 0,
    toEpoch: 5,
    entitlements: [
      { account: OPERATOR_A, cumulative: 600n, proof: [hash(2)] },
      { account: OPERATOR_B, cumulative: 400n, proof: [hash(3)] },
    ],
    createdAt: at(10),
    ...overrides,
  };
}

function storeContract(name: string, open: () => Promise<Store>): void {
  describe(`${name} store`, () => {
    let store: Store;
    beforeEach(async () => {
      store = await open();
      await deployRigs(store);
    });

    it('records deployments once and applies registry changes', async () => {
      const replay = { nodeKey: RIG_1, operator: OPERATOR_B, pair: STOCK, name: 'again', deployedAt: at(9) };
      await store.rigs.deploy({ ...replay, deployedBlock: 99n });
      await store.rigs.setPair(RIG_1, STOCK);
      await store.rigs.retire(RIG_2, at(20));
      const one = await store.rigs.get(RIG_1);
      assert.equal(one?.operator, OPERATOR_A);
      assert.equal(one?.name, 'one');
      assert.equal(one?.pair, STOCK);
      assert.equal(one?.deployedBlock, 10n);
      assert.deepEqual(one?.models, ['small-model']);
      assert.deepEqual(one?.gpu, { model: 'card', vramMb: 8_192, uuid: 'GPU-1001' });
      assert.equal(one?.network, 'net-1001');
      const two = await store.rigs.get(RIG_2);
      assert.equal(two?.retired, true);
      assert.deepEqual(two?.retiredAt, at(20));
      assert.equal(await store.rigs.get(address(0xdead)), null);
    });

    const board = (query: Partial<RigListQuery>) =>
      store.rigs.list({ sort: 'new', pair: null, operator: null, epoch: 7, limit: 10, offset: 0, ...query });

    it('lists the board with sorting, a pair filter and pagination', async () => {
      await store.work.credit(RIG_1, 7, { verified: 5, unverified: 0, paid: 5 });
      await store.work.credit(RIG_3, 6, { verified: 50, unverified: 0, paid: 50 });
      await store.work.credit(RIG_3, 7, { verified: 1, unverified: 3, paid: 1 });
      const newest = await board({});
      assert.deepEqual(newest.rigs.map((rig) => rig.nodeKey), [RIG_3, RIG_2, RIG_1]);
      assert.equal(newest.total, 3);
      const top = await board({ sort: 'top' });
      assert.deepEqual(
        top.rigs.map((rig) => [rig.nodeKey, rig.verifiedUnits]),
        [[RIG_3, 51n], [RIG_1, 5n], [RIG_2, 0n]],
      );
      const epoch = await board({ sort: 'epoch', limit: 1 });
      assert.deepEqual(epoch.rigs.map((rig) => [rig.nodeKey, rig.epochUnits]), [[RIG_1, 5n]]);
      assert.equal(epoch.total, 3);
      const stocks = await board({ pair: STOCK });
      assert.deepEqual(stocks.rigs.map((rig) => rig.nodeKey), [RIG_2]);
      const beyond = await board({ offset: 5 });
      assert.deepEqual([beyond.total, beyond.rigs.length], [3, 0]);
    });

    it('filters the board by operator, alone or with a pair, leaving retired rigs out', async () => {
      const own = await board({ operator: OPERATOR_A });
      assert.equal(own.total, 2);
      assert.deepEqual(own.rigs.map((rig) => [rig.nodeKey, rig.pair]), [[RIG_2, STOCK], [RIG_1, ETH]]);
      const ownStock = await board({ operator: OPERATOR_A, pair: STOCK });
      assert.deepEqual(ownStock.rigs.map((rig) => rig.nodeKey), [RIG_2]);
      const other = await board({ operator: OPERATOR_B, pair: STOCK });
      assert.deepEqual([other.total, other.rigs], [0, []]);
      await store.rigs.retire(RIG_2, at(20));
      const afterRetire = await board({ operator: OPERATOR_A });
      assert.deepEqual([afterRetire.total, afterRetire.rigs.map((rig) => rig.nodeKey)], [1, [RIG_1]]);
      const nobody = await board({ operator: address(0xdead) });
      assert.deepEqual([nobody.total, nobody.rigs], [0, []]);
    });

    it('tracks liveness, checks and challenges', async () => {
      await store.rigs.recordHeartbeat(RIG_1, { runtime: 'local', models: ['other'] }, 'net-moved', at(40));
      await store.rigs.recordCheck(RIG_1, true, at(41));
      await store.rigs.recordCheck(RIG_1, false, at(42));
      await store.rigs.markChallenged(RIG_1, at(43));
      const rig = await store.rigs.get(RIG_1);
      assert.deepEqual([rig?.models, rig?.network], [['other'], 'net-moved']);
      assert.equal(rig?.runtimeVersion, null);
      assert.deepEqual([rig?.checksPassed, rig?.checksFailed], [1, 1]);
      assert.equal(rig?.qualifiedAt, null);
      assert.deepEqual(rig?.lastChallengeAt, at(43));
      assert.deepEqual(await store.rigs.counts(at(30)), { total: 3, online: 1 });
    });

    it('accepts a nonce once and prunes expired ones', async () => {
      assert.equal(await store.nonces.use(RIG_1, 'nonce-0001', at(10)), true);
      assert.equal(await store.nonces.use(RIG_1, 'nonce-0001', at(10)), false);
      assert.equal(await store.nonces.use(RIG_2, 'nonce-0001', at(10)), true);
      assert.equal(await store.nonces.prune(at(11)), 2);
      assert.equal(await store.nonces.prune(at(11)), 0);
    });

    it('offers jobs by model, target and qualification, keeping twins apart by operator', async () => {
      const rig1 = await store.rigs.get(RIG_1);
      const rig2 = await store.rigs.get(RIG_2);
      const rig3 = await store.rigs.get(RIG_3);
      assert.ok(rig1 && rig2 && rig3);
      const first = job({ createdAt: at(5) });
      const twin = job({ groupId: first.id, createdAt: at(5) });
      const otherModel = job({ model: 'large-model', createdAt: at(6) });
      const expired = job({ expiresAt: at(8), createdAt: at(4) });
      const check = job({ kind: 'challenge', targetNode: RIG_2, expected: '42', createdAt: at(7) });
      for (const entry of [first, twin, otherModel, expired, check]) await store.jobs.insert(entry);

      const now = at(10);
      const unqualified = await store.jobs.assignable({ rig: rig2, qualified: false, now, limit: 10 });
      assert.deepEqual(unqualified.map((j) => j.id), [check.id]);
      const offered = await store.jobs.assignable({ rig: rig2, qualified: true, now, limit: 10 });
      assert.deepEqual(offered.map((j) => j.id), [check.id, ...[first.id, twin.id].sort()]);

      await store.jobs.assign(first.id, RIG_1, now, at(12));
      const afterOne = await store.jobs.assignable({ rig: rig2, qualified: true, now, limit: 10 });
      assert.deepEqual(afterOne.map((j) => j.id), [check.id]);
      const forOtherOperator = await store.jobs.assignable({ rig: rig3, qualified: true, now, limit: 10 });
      assert.deepEqual(forOtherOperator.map((j) => j.id), [twin.id]);

      assert.equal(await store.jobs.inFlight(RIG_1), 1);
      assert.deepEqual((await store.jobs.openChecks(RIG_2)).map((j) => j.id), [check.id]);
      assert.equal(await store.jobs.queuedCount('chat'), 3);
      assert.deepEqual((await store.jobs.stale(now)).map((j) => j.id), [expired.id]);
      assert.deepEqual((await store.jobs.overdue(at(13))).map((j) => j.id), [first.id]);
      assert.deepEqual((await store.jobs.group(first.id)).map((j) => j.id).sort(), [first.id, twin.id].sort());
      assert.equal(await store.jobs.get('missing'), null);
      assert.deepEqual(await store.jobs.group('missing'), []);
    });

    it('moves jobs through their states and reports verified work', async () => {
      const chat = job();
      const check = job({ kind: 'challenge', targetNode: RIG_3, expected: '42' });
      const bench = job({ kind: 'benchmark', targetNode: RIG_3, expected: '7' });
      for (const entry of [chat, check, bench]) await store.jobs.insert(entry);
      await assert.rejects(store.jobs.insert(chat));

      await store.jobs.assign(chat.id, RIG_1, at(10), at(12));
      await store.jobs.release(chat.id);
      let stored = await store.jobs.get(chat.id);
      assert.deepEqual([stored?.status, stored?.assignedNode, stored?.attempts], ['queued', null, 1]);

      await store.jobs.assign(chat.id, RIG_3, at(11), at(13));
      await store.jobs.complete(chat.id, {
        output: 'hi there',
        outputHash: hash(9),
        units: 2,
        verification: 'pending',
        finishedAt: at(12),
        verifiedAt: null,
      });
      await store.jobs.setVerification(chat.id, 'verified', at(75));
      stored = await store.jobs.get(chat.id);
      assert.deepEqual(
        [stored?.status, stored?.output, stored?.units, stored?.verification, stored?.attempts],
        ['done', 'hi there', 2, 'verified', 2],
      );
      assert.deepEqual(stored?.messages, chat.messages);
      assert.deepEqual(stored?.params, chat.params);

      for (const [entry, units, minute] of [[check, 3, 20], [bench, 100, 21]] as const) {
        await store.jobs.assign(entry.id, RIG_3, at(minute), at(minute + 1));
        await store.jobs.complete(entry.id, {
          output: 'x',
          outputHash: hash(units),
          units,
          verification: 'verified',
          finishedAt: at(minute),
          verifiedAt: at(minute),
        });
      }
      const dropped = job();
      await store.jobs.insert(dropped);
      await store.jobs.expireBy(dropped.id, at(20));
      await store.jobs.expireBy(dropped.id, at(25));
      assert.deepEqual((await store.jobs.get(dropped.id))?.expiresAt, at(20));
      await store.jobs.close(dropped.id, 'cancelled', at(80));
      const closed = await store.jobs.get(dropped.id);
      assert.deepEqual([closed?.status, closed?.finishedAt], ['cancelled', at(80)]);

      assert.deepEqual(await store.jobs.completedSince(at(0)), { chat: 1, benchmark: 1, challenge: 1 });
      assert.equal(await store.jobs.verifiedUnitsSince(at(0)), 2n);
      assert.equal(await store.jobs.verifiedUnitsSince(at(76)), 0n);
      assert.deepEqual(await store.jobs.hourlyVerifiedUnits(RIG_3, at(0)), [
        { hour: new Date(Date.UTC(2026, 8, 29, 13)), units: 2n },
      ]);
    });

    it('credits work per epoch and sums it per rig with its operator', async () => {
      await store.work.credit(RIG_1, 3, { verified: 10, unverified: 4, paid: 5 });
      await store.work.credit(RIG_1, 3, { verified: 5, unverified: 0, paid: 5 });
      await store.work.credit(RIG_1, 4, { verified: 1, unverified: 0, paid: 1 });
      await store.work.credit(RIG_3, 4, { verified: 0, unverified: 9, paid: 0 });
      await store.work.credit(RIG_3, 9, { verified: 2, unverified: 0, paid: 2 });
      assert.equal(await store.work.epochUnits(RIG_1, 3), 15n);
      assert.equal(await store.work.epochUnits(RIG_2, 3), 0n);
      assert.equal((await store.rigs.get(RIG_1))?.verifiedUnits, 16n);
      assert.deepEqual(await store.work.verifiedByRig(3, 4), [
        { nodeKey: RIG_1, operator: OPERATOR_A, verified: 16n, units: 11n },
      ]);
      assert.deepEqual(await store.work.verifiedByRig(0, 100), [
        { nodeKey: RIG_1, operator: OPERATOR_A, verified: 16n, units: 11n },
        { nodeKey: RIG_3, operator: OPERATOR_B, verified: 2n, units: 2n },
      ]);
    });

    it('pays nothing for an epoch in which the rig was quarantined', async () => {
      await store.work.credit(RIG_1, 3, { verified: 10, unverified: 0, paid: 10 });
      await store.work.credit(RIG_1, 4, { verified: 6, unverified: 0, paid: 6 });
      await store.work.credit(RIG_3, 4, { verified: 8, unverified: 0, paid: 8 });
      await store.sentinel.quarantine(RIG_1, [4, 5]);
      await store.sentinel.quarantine(RIG_1, [4]);
      assert.deepEqual(await store.work.verifiedByRig(3, 5), [
        { nodeKey: RIG_1, operator: OPERATOR_A, verified: 16n, units: 10n },
        { nodeKey: RIG_3, operator: OPERATOR_B, verified: 8n, units: 8n },
      ]);
      assert.deepEqual(await store.work.verifiedByRig(4, 4), [
        { nodeKey: RIG_3, operator: OPERATOR_B, verified: 8n, units: 8n },
      ]);
    });

    it('keeps rigs that share an operator, a network or a card from checking each other', async () => {
      const report = (network: string, uuid: string) => ({
        clientVersion: '0.1.0',
        gpu: { model: 'card', vramMb: 8_192, uuid },
        runtime: RUNTIME,
        network,
      });
      const four = { nodeKey: RIG_4, operator: OPERATOR_C, pair: ETH, name: 'four', deployedAt: at(4), deployedBlock: 13n };
      const five = { nodeKey: RIG_5, operator: OPERATOR_D, pair: ETH, name: 'five', deployedAt: at(4), deployedBlock: 14n };
      await store.rigs.deploy(four);
      await store.rigs.deploy(five);
      await store.rigs.recordHello(RIG_4, report('net-1003', 'GPU-own4'), at(4));
      await store.rigs.recordHello(RIG_5, report('net-own5', 'GPU-1003'), at(4));
      const first = job({ createdAt: at(5) });
      const twin = job({ groupId: first.id, createdAt: at(5) });
      for (const entry of [first, twin]) await store.jobs.insert(entry);
      await store.jobs.assign(first.id, RIG_3, at(6), at(9));

      const offered = async (nodeKey: Address): Promise<string[]> => {
        const rig = await store.rigs.get(nodeKey);
        assert.ok(rig);
        return (await store.jobs.assignable({ rig, qualified: true, now: at(7), limit: 10 })).map((j) => j.id);
      };
      assert.deepEqual(await offered(RIG_4), [], 'same network as the holder');
      assert.deepEqual(await offered(RIG_5), [], 'same card as the holder');
      assert.deepEqual(await offered(RIG_1), [twin.id]);
    });

    it('offers a playground prompt to no rig on the network it came from', async () => {
      const prompt = job({ originNetwork: 'net-1001' });
      await store.jobs.insert(prompt);
      const offered = async (nodeKey: Address): Promise<string[]> => {
        const rig = await store.rigs.get(nodeKey);
        assert.ok(rig);
        return (await store.jobs.assignable({ rig, qualified: true, now: at(7), limit: 10 })).map((j) => j.id);
      };
      assert.deepEqual(await offered(RIG_1), []);
      assert.deepEqual(await offered(RIG_3), [prompt.id]);
      const stored = await store.jobs.get(prompt.id);
      assert.deepEqual([stored?.origin, stored?.originNetwork, stored?.canaryId], ['playground', 'net-1001', null]);
    });

    it('keeps each rig standing, speed and canary schedule, and counts rigs by standing', async () => {
      const fresh = await store.rigs.get(RIG_1);
      assert.deepEqual(
        [fresh?.standing, fresh?.canariesPassed, fresh?.quarantinedUntil, fresh?.speedSamples, fresh?.nextCanaryAt],
        ['probation', 0, null, [], null],
      );
      await store.rigs.updateSentinel(RIG_1, { standing: 'trusted', canariesPassed: 5, speedSamples: [81.5, 90] });
      await store.rigs.updateSentinel(RIG_3, { standing: 'quarantined', quarantinedUntil: at(50), nextCanaryAt: at(9) });
      const trusted = await store.rigs.get(RIG_1);
      assert.deepEqual([trusted?.standing, trusted?.canariesPassed, trusted?.speedSamples], ['trusted', 5, [81.5, 90]]);
      const held = await store.rigs.get(RIG_3);
      assert.deepEqual([held?.quarantinedUntil, held?.nextCanaryAt], [at(50), at(9)]);
      assert.deepEqual(await store.rigs.standingCounts(), { probation: 1, trusted: 1, quarantined: 1 });
      await store.rigs.retire(RIG_2, at(60));
      assert.deepEqual(await store.rigs.standingCounts(), { probation: 0, trusted: 1, quarantined: 1 });
    });

    it('tallies gate decisions and counts strikes inside a window', async () => {
      await store.sentinel.tally('identity', 'passed', at(10));
      await store.sentinel.tally('identity', 'passed', at(10));
      await store.sentinel.tally('identity', 'blocked', at(11));
      await store.sentinel.tally('canary', 'blocked', at(40));
      assert.deepEqual(await store.sentinel.gateCounts(at(0)), [
        { gate: 'identity', passed: 2, blocked: 1 },
        { gate: 'gpu', passed: 0, blocked: 0 },
        { gate: 'canary', passed: 0, blocked: 1 },
        { gate: 'crosscheck', passed: 0, blocked: 0 },
        { gate: 'reputation', passed: 0, blocked: 0 },
      ]);
      const identityAfter = async (minute: number) =>
        (await store.sentinel.gateCounts(at(minute))).find((entry) => entry.gate === 'identity');
      assert.deepEqual(await identityAfter(30), { gate: 'identity', passed: 0, blocked: 0 });

      await store.sentinel.strike(RIG_1, 'canary_failed', at(10));
      await store.sentinel.strike(RIG_1, 'tiebreak_lost', at(20));
      await store.sentinel.strike(RIG_3, 'job_abandoned', at(20));
      assert.equal(await store.sentinel.strikesSince(RIG_1, at(0)), 2);
      assert.equal(await store.sentinel.strikesSince(RIG_1, at(15)), 1);

      await store.sentinel.prune(at(15), 10);
      assert.equal(await store.sentinel.strikesSince(RIG_1, at(0)), 1);
      assert.deepEqual(await identityAfter(0), { gate: 'identity', passed: 0, blocked: 0 });
    });

    it('draws canaries a rig never saw, and confirms, disputes, retires and prunes them', async () => {
      const canary = (id: string, minute: number, sources: Address[]) => ({
        id,
        model: 'small-model',
        messages: [{ role: 'user' as const, content: `prompt ${id}` }],
        params: { temperature: 0 as const, seed: 3, maxTokens: 64 },
        answer: 'the agreed answer',
        sources,
        createdAt: at(minute),
      });
      const [one, two, three] = [randomUUID(), randomUUID(), randomUUID()];
      await store.sentinel.addCanary(canary(one, 1, [RIG_1, RIG_3]));
      await store.sentinel.addCanary(canary(two, 2, [RIG_2, RIG_3]));
      await store.sentinel.addCanary({ ...canary(three, 3, [RIG_2]), model: 'large-model' });
      assert.equal(await store.sentinel.canaryCount('small-model'), 2);

      const random = seededRandom(5);
      const forRig1 = await store.sentinel.pickCanary('small-model', RIG_1, random);
      assert.equal(forRig1?.id, two);
      assert.deepEqual([forRig1?.servedTo, forRig1?.confirmations, forRig1?.disputes], [[], 0, 0]);
      assert.deepEqual(forRig1?.messages, canary(two, 2, []).messages);
      assert.equal(await store.sentinel.pickCanary('small-model', RIG_3, random), null);

      await store.sentinel.markServed(two, RIG_1);
      await store.sentinel.markServed(two, RIG_1);
      assert.equal(await store.sentinel.pickCanary('small-model', RIG_1, random), null);
      assert.deepEqual((await store.sentinel.getCanary(two))?.servedTo, [RIG_1]);

      await store.sentinel.confirm(two);
      await store.sentinel.dispute(two);
      const judged = await store.sentinel.getCanary(two);
      assert.deepEqual([judged?.confirmations, judged?.disputes], [1, 1]);
      await store.sentinel.retire(one);
      assert.equal(await store.sentinel.getCanary(one), null);

      await store.sentinel.addCanary(canary(randomUUID(), 4, [RIG_1]));
      await store.sentinel.prune(at(0), 1);
      assert.equal(await store.sentinel.canaryCount('small-model'), 1);
      assert.equal(await store.sentinel.getCanary(two), null, 'the oldest past the bank size goes first');
      assert.equal(await store.sentinel.canaryCount('large-model'), 1);
    });

    it('counts open jobs by origin', async () => {
      const seed = job({ origin: 'seed' });
      const done = job({ origin: 'seed' });
      for (const entry of [seed, done, job()]) await store.jobs.insert(entry);
      await store.jobs.assign(done.id, RIG_1, at(10), at(12));
      await store.jobs.close(done.id, 'expired', at(13));
      assert.equal(await store.jobs.openCount('seed'), 1);
      assert.equal(await store.jobs.openCount('playground'), 1);
      assert.equal(await store.jobs.openCount('canary'), 0);
    });

    it('stores hostile text as data, never as part of a statement', async () => {
      const hostile = [
        "'); DROP TABLE rigs; --",
        "x' OR '1'='1",
        'Robert"); DELETE FROM jobs WHERE ("1"="1',
        '$1 $2 ${nodeKey} \\x00 ; COMMIT; DROP SCHEMA public CASCADE;',
      ];
      const [name = '', other = '', version = '', client = ''] = hostile;
      await store.rigs.deploy({ nodeKey: RIG_4, operator: OPERATOR_C, pair: ETH, name, deployedAt: at(4), deployedBlock: 13n });
      const runtime = { runtime: other, version, models: hostile };
      const report = { clientVersion: client, gpu: { model: other, vramMb: 1 }, runtime, network: other };
      await store.rigs.recordHello(RIG_4, report, at(5));
      const messages = hostile.map((content) => ({ role: 'user' as const, content }));
      const prompt = job({ messages, originNetwork: name });
      await store.jobs.insert(prompt);

      const stored = await store.rigs.get(RIG_4);
      assert.deepEqual(
        [stored?.name, stored?.runtime, stored?.runtimeVersion, stored?.models, stored?.clientVersion, stored?.network],
        [name, other, version, hostile, client, other],
      );
      assert.deepEqual((await store.jobs.get(prompt.id))?.messages.map((message) => message.content), hostile);
      const onlyHostile = await store.rigs.list({
        sort: 'new',
        pair: null,
        operator: OPERATOR_C,
        epoch: 0,
        limit: 10,
        offset: 0,
      });
      assert.deepEqual(onlyHostile.rigs.map((entry) => entry.name), [name]);
      assert.deepEqual(await store.rigs.counts(at(0)), { total: 4, online: 4 });
      assert.equal(await store.jobs.queuedCount('chat'), 1);
    });

    it('carries a settlement from draft to publication and veto', async () => {
      const id = await store.settlements.createDraft(draft());
      assert.deepEqual((await store.settlements.open()).map((row) => [row.id, row.status]), [[id, 'sending']]);
      const entitlement = await store.settlements.entitlement(id, OPERATOR_B);
      assert.deepEqual(entitlement, { account: OPERATOR_B, cumulative: 400n, proof: [hash(3)] });
      assert.equal((await store.settlements.entitlements(id)).length, 2);

      await store.settlements.markSent(id, hash(0x77));
      const first = {
        index: 1,
        root: hash(0xabc),
        total: 1_000n,
        inputsDigest: hash(0xdef),
        txHash: hash(0x77),
        blockNumber: 500n,
        publishedAt: at(11),
        claimableAt: at(41),
      };
      await store.settlements.recordPublished(first);
      await store.settlements.recordPublished(first);
      await store.settlements.markFailed(id, 'a late failure');
      await store.settlements.markSent(id, hash(0x99));
      assert.equal((await store.settlements.recent(10)).length, 1);
      const published = await store.settlements.byIndex(1);
      assert.equal(published?.id, id);
      assert.deepEqual([published?.txHash, published?.error], [hash(0x77), null]);
      assert.deepEqual(
        [published?.status, published?.total, published?.blockNumber, published?.inputs],
        ['published', 1_000n, 500n, '{"version":1}'],
      );
      assert.deepEqual(published?.dump, DUMP);
      assert.deepEqual(await store.settlements.open(), []);
      assert.equal((await store.settlements.latestPending(at(20)))?.index, 1);
      assert.equal(await store.settlements.latestClaimable(at(20)), null);
      assert.equal((await store.settlements.latestClaimable(at(41)))?.index, 1);

      await store.settlements.recordPublished({
        index: 2,
        root: hash(0xbbb),
        total: 2_000n,
        inputsDigest: hash(0xccc),
        txHash: hash(0x78),
        blockNumber: 600n,
        publishedAt: at(50),
        claimableAt: at(80),
      });
      const foreign = await store.settlements.byIndex(2);
      assert.deepEqual([foreign?.inputs, foreign?.dump, foreign?.status], [null, null, 'published']);
      await store.settlements.markVetoed(2);
      assert.equal((await store.settlements.latestClaimable(at(90)))?.index, 1);
      const recent = await store.settlements.recent(10);
      assert.deepEqual(recent.map((row) => [row.index, row.vetoed]), [[2, true], [1, false]]);

      const failed = await store.settlements.createDraft(draft({ root: hash(0xfff) }));
      await store.settlements.markFailed(failed, 'reverted');
      assert.deepEqual(await store.settlements.open(), []);
    });

    it('indexes burns, campaigns, claims and the cursor', async () => {
      assert.equal(await store.chain.cursor(), null);
      await store.chain.setCursor(100n);
      await store.chain.setCursor(200n);
      assert.equal(await store.chain.cursor(), 200n);

      const burn = { blockTime: at(1), from: OPERATOR_A, memo: hash(0) };
      const first = { ...burn, blockNumber: 10n, txHash: hash(1), logIndex: 0, amount: 5n, campaignId: 1n };
      await store.chain.addBurn(first);
      await store.chain.addBurn(first);
      const later = { blockNumber: 11n, txHash: hash(2), logIndex: 3, amount: 7n, campaignId: 1n, blockTime: at(2) };
      await store.chain.addBurn({ ...burn, ...later });
      const unnamed = { blockNumber: 12n, txHash: hash(3), logIndex: 1, amount: 1n, campaignId: 0n, blockTime: at(3) };
      await store.chain.addBurn({ ...burn, ...unnamed });
      assert.deepEqual((await store.chain.recentBurns(2)).map((b) => b.amount), [1n, 7n]);
      assert.deepEqual(await store.chain.currentCampaign(), {
        campaignId: 1n,
        memo: hash(0),
        burned: 12n,
        burns: 2,
        firstBurnAt: at(1),
        lastBurnAt: at(2),
      });

      const claim = { blockNumber: 20n, blockTime: at(4), account: OPERATOR_B, index: 1, via: ETH };
      await store.chain.addClaim({ ...claim, txHash: hash(4), logIndex: 0, amount: 30n });
      await store.chain.addClaim({ ...claim, txHash: hash(4), logIndex: 0, amount: 30n });
      await store.chain.addClaim({ ...claim, txHash: hash(5), logIndex: 0, amount: 12n });
      assert.equal(await store.chain.claimedBy(OPERATOR_B), 42n);
      assert.equal(await store.chain.claimedBy(OPERATOR_A), 0n);
    });

    it('rolls a failed transaction back', async () => {
      await assert.rejects(
        store.transaction(async (tx) => {
          await tx.rigs.setPair(RIG_1, STOCK);
          await tx.transaction(async (inner) => inner.chain.setCursor(5n));
          throw new Error('stop');
        }),
        /stop/,
      );
      assert.equal((await store.rigs.get(RIG_1))?.pair, ETH);
      assert.equal(await store.chain.cursor(), null);
      assert.equal(await store.transaction(async (tx) => (await tx.rigs.get(RIG_1))?.name), 'one');
    });
  });
}

storeContract('memory', async () => createMemoryStore());

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  const schema = `store_test_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(databaseUrl, { onnotice: () => undefined, max: 1 });
  const sql = postgres(databaseUrl, { onnotice: () => undefined, connection: { search_path: schema } });
  before(async () => {
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await migrate(sql);
  });
  after(async () => {
    await sql.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  storeContract('postgres', async () => {
    await sql`
      TRUNCATE rigs, nonces, jobs, work, settlements, entitlements, burns, claims, chain_cursor,
        canaries, strikes, quarantines, sentinel_tally
      RESTART IDENTITY CASCADE
    `;
    return createPostgresStore(sql);
  });
}
