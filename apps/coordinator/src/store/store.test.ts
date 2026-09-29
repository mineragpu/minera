import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import postgres from 'postgres';
import type { Address, Hex } from '@dayagpu/shared';
import { migrate } from '../db/migrate.ts';
import { createMemoryStore } from './memory/index.ts';
import { createPostgresStore } from './postgres/index.ts';
import type { NewJob, SettlementDraft, TreeDump } from './records.ts';
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
const RUNTIME = { runtime: 'local', version: '1.0.0', models: ['small-model'] };

async function deployRigs(store: Store): Promise<void> {
  const rigs = [
    { nodeKey: RIG_1, operator: OPERATOR_A, pair: ETH, name: 'one', deployedAt: at(0), deployedBlock: 10n },
    { nodeKey: RIG_2, operator: OPERATOR_A, pair: STOCK, name: 'two', deployedAt: at(1), deployedBlock: 11n },
    { nodeKey: RIG_3, operator: OPERATOR_B, pair: ETH, name: 'three', deployedAt: at(2), deployedBlock: 12n },
  ];
  for (const rig of rigs) await store.rigs.deploy(rig);
  for (const nodeKey of [RIG_1, RIG_2, RIG_3]) {
    const report = { clientVersion: '0.1.0', gpu: { model: 'card', vramMb: 8_192 }, runtime: RUNTIME };
    await store.rigs.recordHello(nodeKey, report, at(3));
  }
}

function job(overrides: Partial<NewJob> = {}): NewJob {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    groupId: id,
    kind: 'chat',
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
      assert.deepEqual(one?.gpu, { model: 'card', vramMb: 8_192 });
      const two = await store.rigs.get(RIG_2);
      assert.equal(two?.retired, true);
      assert.deepEqual(two?.retiredAt, at(20));
      assert.equal(await store.rigs.get(address(0xdead)), null);
    });

    it('lists the board with sorting, a pair filter and pagination', async () => {
      await store.work.credit(RIG_1, 7, { verified: 5, unverified: 0 });
      await store.work.credit(RIG_3, 6, { verified: 50, unverified: 0 });
      await store.work.credit(RIG_3, 7, { verified: 1, unverified: 3 });
      const newest = await store.rigs.list({ sort: 'new', pair: null, epoch: 7, limit: 10, offset: 0 });
      assert.deepEqual(newest.rigs.map((rig) => rig.nodeKey), [RIG_3, RIG_2, RIG_1]);
      assert.equal(newest.total, 3);
      const top = await store.rigs.list({ sort: 'top', pair: null, epoch: 7, limit: 10, offset: 0 });
      assert.deepEqual(
        top.rigs.map((rig) => [rig.nodeKey, rig.verifiedUnits]),
        [[RIG_3, 51n], [RIG_1, 5n], [RIG_2, 0n]],
      );
      const epoch = await store.rigs.list({ sort: 'epoch', pair: null, epoch: 7, limit: 1, offset: 0 });
      assert.deepEqual(epoch.rigs.map((rig) => [rig.nodeKey, rig.epochUnits]), [[RIG_1, 5n]]);
      assert.equal(epoch.total, 3);
      const stocks = await store.rigs.list({ sort: 'new', pair: STOCK, epoch: 7, limit: 10, offset: 0 });
      assert.deepEqual(stocks.rigs.map((rig) => rig.nodeKey), [RIG_2]);
      const beyond = await store.rigs.list({ sort: 'new', pair: null, epoch: 7, limit: 10, offset: 5 });
      assert.deepEqual([beyond.total, beyond.rigs.length], [3, 0]);
    });

    it('tracks liveness, checks and challenges', async () => {
      await store.rigs.recordHeartbeat(RIG_1, { runtime: 'local', models: ['other'] }, at(40));
      await store.rigs.recordCheck(RIG_1, true, at(41));
      await store.rigs.recordCheck(RIG_1, false, at(42));
      await store.rigs.markChallenged(RIG_1, at(43));
      const rig = await store.rigs.get(RIG_1);
      assert.deepEqual(rig?.models, ['other']);
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
      await store.work.credit(RIG_1, 3, { verified: 10, unverified: 4 });
      await store.work.credit(RIG_1, 3, { verified: 5, unverified: 0 });
      await store.work.credit(RIG_1, 4, { verified: 1, unverified: 0 });
      await store.work.credit(RIG_3, 4, { verified: 0, unverified: 9 });
      await store.work.credit(RIG_3, 9, { verified: 2, unverified: 0 });
      assert.equal(await store.work.epochUnits(RIG_1, 3), 15n);
      assert.equal(await store.work.epochUnits(RIG_2, 3), 0n);
      assert.equal((await store.rigs.get(RIG_1))?.verifiedUnits, 16n);
      assert.deepEqual(await store.work.verifiedByRig(3, 4), [{ nodeKey: RIG_1, operator: OPERATOR_A, units: 16n }]);
      assert.deepEqual(await store.work.verifiedByRig(0, 100), [
        { nodeKey: RIG_1, operator: OPERATOR_A, units: 16n },
        { nodeKey: RIG_3, operator: OPERATOR_B, units: 2n },
      ]);
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
      assert.equal((await store.settlements.recent(10)).length, 1);
      const published = await store.settlements.byIndex(1);
      assert.equal(published?.id, id);
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
      TRUNCATE rigs, nonces, jobs, work, settlements, entitlements, burns, claims, chain_cursor
      RESTART IDENTITY CASCADE
    `;
    return createPostgresStore(sql);
  });
}
