import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { keccak256, toBytes } from 'viem';
import type { Address, Hex } from '@minera/shared';
import type { PoolSnapshot } from '../chain/pool.ts';
import { epochOf } from '../epoch.ts';
import { planSettlement } from '../settlement/plan.ts';
import { createTestApp, type TestApp } from '../testing/testApp.ts';

const address = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
const OPERATOR_A = address(0xa);
const OPERATOR_B = address(0xb);
const STOCK = address(0x5e);
const RIG_1 = address(0x101);
const RIG_2 = address(0x102);
const ETH = 10n ** 18n;

let harness: TestApp;

const get = (url: string, headers: Record<string, string> = {}) => harness.app.inject({ method: 'GET', url, headers });
const post = (url: string, payload: unknown) => harness.app.inject({ method: 'POST', url, payload: payload as object });

function snapshot(overrides: Partial<PoolSnapshot> = {}): PoolSnapshot {
  const timestamp = BigInt(harness.clock.now.getTime() / 1000);
  return {
    blockNumber: 126_100_000n,
    timestamp,
    totalBurned: 10n * ETH,
    committed: 0n,
    releasable: ETH,
    head: null,
    latest: null,
    settlementCount: 0,
    deployedAt: timestamp - 86_400n,
    releaseBpsPerDay: 1_000n,
    challengeDelay: 1_800n,
    publisher: address(0xe1),
    ...overrides,
  };
}

beforeEach(async () => {
  harness = await createTestApp({ CORS_ORIGINS: 'https://site.example' });
  const { store, clock } = harness;
  const deployedAt = new Date('2026-09-28T00:00:00Z');
  const one = { nodeKey: RIG_1, operator: OPERATOR_A, pair: address(0), name: 'one', deployedAt, deployedBlock: 1n };
  const two = { nodeKey: RIG_2, operator: OPERATOR_B, pair: STOCK, name: 'two', deployedAt, deployedBlock: 2n };
  await store.rigs.deploy(one);
  await store.rigs.deploy(two);
  await store.rigs.recordHeartbeat(RIG_1, { runtime: 'local', models: ['llama3.2:1b'] }, null, clock.now);
  const epoch = epochOf(clock.now, harness.config.epochSeconds);
  await store.work.credit(RIG_2, epoch, { verified: 12, unverified: 0, paid: 12 });
});

afterEach(async () => {
  await harness.app.close();
});

describe('public routes', () => {
  it('reports health without touching the database', async () => {
    const response = await get('/health');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', version: '0.1.0', network: 'testnet', chainId: 46630 });
  });

  it('summarizes the network, with the pool once it has been read', async () => {
    let body = (await get('/v1/network')).json();
    assert.deepEqual(body.rigs, { online: 1, total: 2 });
    assert.equal(body.pool, null);
    assert.equal(body.epoch.seconds, 3_600);
    assert.match(body.rules.verification, /earn nothing on their own/);
    assert.equal(typeof body.jobs.model, "string");
    assert.ok(body.jobs.model.length > 0);
    assert.ok(body.jobs.maxTokens > 0);
    assert.equal(body.jobs.minUnitsPerSecond, 40);
    assert.equal(typeof body.rules.standing, 'string');

    harness.pool.snapshot = snapshot();
    body = (await get('/v1/network')).json();
    assert.deepEqual([body.pool.totalBurned, body.pool.releasable], [(10n * ETH).toString(), ETH.toString()]);
  });

  it('lists the board with sorting and a pair filter, and validates the query', async () => {
    const top = (await get('/v1/rigs?sort=epoch')).json();
    assert.deepEqual(top.rigs.map((rig: { nodeKey: string }) => rig.nodeKey), [RIG_2, RIG_1]);
    assert.deepEqual(top.rigs[0].verifiedUnits, { epoch: '12', lifetime: '12' });
    assert.equal(top.rigs[1].online, true);

    const eth = (await get('/v1/rigs?pair=eth')).json();
    assert.deepEqual(eth.rigs.map((rig: { nodeKey: string }) => rig.nodeKey), [RIG_1]);
    const stock = (await get(`/v1/rigs?pair=${STOCK.toUpperCase().replace('0X', '0x')}`)).json();
    assert.deepEqual(stock.rigs.map((rig: { nodeKey: string }) => rig.nodeKey), [RIG_2]);

    const bad = await get('/v1/rigs?sort=loudest&limit=0');
    assert.equal(bad.statusCode, 400);
    const paths = bad.json().error.details.map((detail: { path: string }) => detail.path);
    assert.deepEqual(paths.sort(), ['query.limit', 'query.sort']);
  });

  it('lists the rigs of one operator with their pairs, and validates the operator', async () => {
    const third = { nodeKey: address(0x103), operator: OPERATOR_B, pair: address(0), name: 'three' };
    await harness.store.rigs.deploy({ ...third, deployedAt: new Date('2026-09-28T01:00:00Z'), deployedBlock: 3n });

    const own = (await get(`/v1/rigs?sort=top&operator=${OPERATOR_B.replace('0xb', '0xB')}`)).json();
    assert.equal(own.total, 2);
    assert.deepEqual(
      own.rigs.map((rig: { nodeKey: string; operator: string; pair: string }) => [rig.nodeKey, rig.operator, rig.pair]),
      [
        [RIG_2, OPERATOR_B, STOCK],
        [address(0x103), OPERATOR_B, address(0)],
      ],
    );
    const ownEth = (await get(`/v1/rigs?operator=${OPERATOR_B}&pair=eth`)).json();
    assert.deepEqual(ownEth.rigs.map((rig: { nodeKey: string }) => rig.nodeKey), [address(0x103)]);
    const none = (await get(`/v1/rigs?operator=${address(0x77)}`)).json();
    assert.deepEqual([none.total, none.rigs], [0, []]);

    const bad = await get('/v1/rigs?operator=0x123');
    assert.equal(bad.statusCode, 400);
    assert.deepEqual(bad.json().error.details, [
      { path: 'query.operator', message: 'Expected a 0x-prefixed 20-byte address.' },
    ]);
  });

  it('shows a rig with 24 hourly buckets, and 400 or 404 for bad keys', async () => {
    const detail = (await get(`/v1/rigs/${RIG_2}`)).json();
    assert.equal(detail.name, 'two');
    assert.equal(detail.standing, 'probation');
    assert.equal(detail.hourly.length, 24);
    assert.equal(detail.hourly.at(-1).hour, '2026-09-29T12:00:00.000Z');
    assert.equal((await get('/v1/rigs/0x123')).statusCode, 400);
    const missing = await get(`/v1/rigs/${address(0xdead)}`);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'rig_not_found');
  });

  it('publishes the sentinel tally for the last day and the rigs by standing', async () => {
    const { store, clock } = harness;
    await store.sentinel.tally('identity', 'blocked', new Date(clock.now.getTime() - 25 * 3_600_000));
    await store.sentinel.tally('identity', 'blocked', clock.now);
    await store.sentinel.tally('canary', 'passed', clock.now);
    await store.rigs.updateSentinel(RIG_1, { standing: 'trusted' });
    const response = await get('/v1/sentinel');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      asOf: clock.now.toISOString(),
      gates: [
        { gate: 'identity', passed: 0, blocked: 1 },
        { gate: 'gpu', passed: 0, blocked: 0 },
        { gate: 'canary', passed: 1, blocked: 0 },
        { gate: 'crosscheck', passed: 0, blocked: 0 },
        { gate: 'reputation', passed: 0, blocked: 0 },
      ],
      standing: { probation: 1, trusted: 1, quarantined: 0 },
    });
  });

  it('serves pool state, burns and settlements', async () => {
    const claimableAt = BigInt(harness.clock.now.getTime() / 1000) + 60n;
    const latest = { index: 1, publishedAt: 1n, claimableAt, vetoed: false };
    harness.pool.snapshot = snapshot({ latest, head: latest, settlementCount: 1 });
    await harness.store.chain.addBurn({
      blockNumber: 5n,
      blockTime: new Date('2026-09-29T10:00:00Z'),
      txHash: `0x${'aa'.repeat(32)}` as Hex,
      logIndex: 0,
      from: OPERATOR_A,
      amount: ETH,
      campaignId: 1n,
      memo: `0x${Buffer.from('Campaign 01').toString('hex').padEnd(64, '0')}` as Hex,
    });
    const body = (await get('/v1/pool')).json();
    const pendingAt = new Date(Number(claimableAt) * 1000).toISOString();
    assert.deepEqual(body.state.pending, { index: 1, claimableAt: pendingAt });
    assert.equal(body.burns[0].memo, 'Campaign 01');
    assert.deepEqual([body.campaign.id, body.campaign.burned], ['1', ETH.toString()]);
  });

  it('serves a settlement tree anyone can check, and the claim for an account', async () => {
    const pool = snapshot({ releasable: ETH });
    const plan = planSettlement({
      pool,
      base: null,
      fromEpoch: 0,
      toEpoch: 5,
      work: [
        { nodeKey: RIG_1, operator: OPERATOR_A, verified: 1n, units: 1n },
        { nodeKey: RIG_2, operator: OPERATOR_B, verified: 3n, units: 3n },
      ],
      chainId: 46630,
      burnPool: address(0xf0),
      epochSeconds: 3_600,
      createdAt: harness.clock.now,
    });
    assert.equal(plan.kind, 'publish');
    if (plan.kind !== 'publish') return;
    await harness.store.settlements.createDraft(plan.draft);
    await harness.store.settlements.recordPublished({
      index: 1,
      root: plan.draft.root,
      total: plan.draft.total,
      inputsDigest: plan.draft.inputsDigest,
      txHash: `0x${'bb'.repeat(32)}` as Hex,
      blockNumber: 7n,
      publishedAt: new Date('2026-09-29T10:00:00Z'),
      claimableAt: new Date('2026-09-29T10:30:00Z'),
    });

    const settlement = (await get('/v1/settlements/1')).json();
    assert.equal(settlement.root, plan.draft.root);
    assert.equal(keccak256(toBytes(settlement.inputsJson)), settlement.inputsDigest);
    assert.equal(settlement.inputs.budget, ETH.toString());
    assert.equal(settlement.tree.format, 'standard-v1');
    assert.equal((await get('/v1/settlements/abc')).statusCode, 400);
    assert.equal((await get('/v1/settlements/9')).statusCode, 404);

    await harness.store.chain.addClaim({
      blockNumber: 8n,
      blockTime: new Date('2026-09-29T11:00:00Z'),
      txHash: `0x${'cc'.repeat(32)}` as Hex,
      logIndex: 0,
      account: OPERATOR_B,
      index: 1,
      amount: 10n ** 17n,
      via: address(0),
    });
    const claim = (await get(`/v1/claims/${OPERATOR_B}`)).json();
    const expected = (3n * ETH) / 4n;
    assert.deepEqual(
      [claim.cumulative, claim.claimed, claim.claimable],
      [expected.toString(), (10n ** 17n).toString(), (expected - 10n ** 17n).toString()],
    );
    assert.equal(claim.settlement.index, 1);
    assert.ok(claim.proof.length > 0);
    const nobody = (await get(`/v1/claims/${address(0x77)}`)).json();
    assert.deepEqual([nobody.cumulative, nobody.claimable, nobody.proof], ['0', '0', []]);
    assert.equal((await get('/v1/claims/someone')).statusCode, 400);
  });

  it('answers unknown routes and broken JSON with the same error shape', async () => {
    const missing = await get('/v2/everything');
    assert.deepEqual(missing.json(), { error: { code: 'not_found', message: 'There is no such route.' } });
    const broken = await harness.app.inject({
      method: 'POST',
      url: '/v1/node/hello',
      headers: { 'content-type': 'application/json' },
      payload: '{"prompt":',
    });
    assert.equal(broken.statusCode, 400);
    assert.equal(broken.json().error.code, 'invalid_request');
  });

  it('allows only the configured origins', async () => {
    const allowed = await get('/health', { origin: 'https://site.example' });
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://site.example');
    const other = await get('/health', { origin: 'https://elsewhere.example' });
    assert.equal(other.headers['access-control-allow-origin'], undefined);
  });

  it('queues playground prompts, validates them and limits each address', async () => {
    const empty = await post('/v1/playground/jobs', { prompt: '   ' });
    assert.equal(empty.statusCode, 400);
    assert.equal(empty.json().error.details[0].message, 'Enter a prompt.');
    assert.equal((await post('/v1/playground/jobs', { prompt: 'x'.repeat(2_001) })).statusCode, 400);

    const accepted = await post('/v1/playground/jobs', { prompt: 'What is a GPU?' });
    assert.equal(accepted.statusCode, 202);
    const { id } = accepted.json();
    const view = (await get(`/v1/playground/jobs/${id}`)).json();
    assert.deepEqual(
      [view.status, view.output, view.crossChecked, view.prompt],
      ['queued', null, false, 'What is a GPU?'],
    );
    assert.match(view.rule, /Only verified work earns rewards/);
    assert.equal((await get(`/v1/playground/jobs/${id.toUpperCase()}`)).json().id, id);
    assert.equal((await get('/v1/playground/jobs/00000000-0000-4000-8000-0000000fffff')).statusCode, 404);
    assert.equal((await get('/v1/playground/jobs/nope')).statusCode, 400);

    for (let i = 0; i < 2; i += 1) await post('/v1/playground/jobs', { prompt: `Question ${i}` });
    const limited = await post('/v1/playground/jobs', { prompt: 'One more' });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, 'rate_limited');
  });
});
