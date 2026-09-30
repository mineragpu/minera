import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { keccak256, toBytes } from 'viem';
import { buildSettlement, releasable, type Address } from '@minera/shared';
import { poolState, type PoolSnapshot } from '../chain/pool.ts';
import type { RigWork } from '../store/records.ts';
import { seededRandom } from '../testing/seededRandom.ts';
import { epochRange, planSettlement, SettlementGuardError, type BaseSettlement, type PlanInput } from './plan.ts';

const ETH = 10n ** 18n;
const DAY = 86_400n;
const DEPLOYED = 1_790_000_000n;
const POOL = '0x00000000000000000000000000000000000000f0' as Address;
const address = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
const OPERATOR_A = address(0xa);
const OPERATOR_B = address(0xb);

function snapshot(overrides: Partial<PoolSnapshot> = {}): PoolSnapshot {
  const base: PoolSnapshot = {
    blockNumber: 1_000n,
    timestamp: DEPLOYED + DAY,
    totalBurned: 100n * ETH,
    committed: 0n,
    releasable: 0n,
    head: null,
    latest: null,
    settlementCount: 0,
    deployedAt: DEPLOYED,
    releaseBpsPerDay: 1_000n,
    challengeDelay: 1_800n,
    publisher: address(0x99),
    ...overrides,
  };
  return { ...base, releasable: overrides.releasable ?? releasable(poolState(base), base.timestamp) };
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    pool: snapshot(),
    base: null,
    fromEpoch: 0,
    toEpoch: 10,
    work: [
      { nodeKey: address(0x1), operator: OPERATOR_A, verified: 30n, units: 30n },
      { nodeKey: address(0x2), operator: OPERATOR_A, verified: 20n, units: 10n },
      { nodeKey: address(0x3), operator: OPERATOR_B, verified: 60n, units: 60n },
    ],
    chainId: 46630,
    burnPool: POOL,
    epochSeconds: 3_600,
    createdAt: new Date(0),
    ...overrides,
  };
}

function publish(plan: ReturnType<typeof planSettlement>) {
  assert.equal(plan.kind, 'publish', plan.kind === 'skip' ? plan.reason : '');
  if (plan.kind !== 'publish') throw new Error('unreachable');
  return plan;
}

describe('planSettlement', () => {
  it('releases the budget by verified units per operator account', () => {
    const plan = publish(planSettlement(input()));
    assert.equal(plan.budget, 10n * ETH);
    const cumulative = new Map(plan.draft.entitlements.map((entry) => [entry.account, entry.cumulative]));
    assert.equal(cumulative.get(OPERATOR_A), 4n * ETH);
    assert.equal(cumulative.get(OPERATOR_B), 6n * ETH);
    assert.equal(plan.draft.total, 10n * ETH);
    assert.equal(plan.draft.root, buildSettlement(cumulative).root);
  });

  it('publishes a digest of the exact inputs document', () => {
    const plan = publish(planSettlement(input()));
    assert.equal(plan.draft.inputsDigest, keccak256(toBytes(plan.draft.inputs)));
    const inputs = JSON.parse(plan.draft.inputs);
    assert.equal(JSON.stringify(inputs), plan.draft.inputs);
    assert.deepEqual(inputs.allocation, [
      { account: OPERATOR_A, amount: (4n * ETH).toString() },
      { account: OPERATOR_B, amount: (6n * ETH).toString() },
    ]);
    assert.deepEqual(
      [inputs.previousIndex, inputs.fromEpoch, inputs.toEpoch, inputs.budget],
      [0, 0, 10, (10n * ETH).toString()],
    );
    assert.equal(inputs.work.length, 3);
  });

  it('adds new rewards on top of the head settlement', () => {
    const entitlements = new Map([[OPERATOR_A, 4n * ETH], [OPERATOR_B, 6n * ETH]]);
    const base: BaseSettlement = { index: 1, toEpoch: 10, epochSeconds: 3_600, entitlements };
    const head = { index: 1, publishedAt: DEPLOYED + DAY, claimableAt: DEPLOYED + DAY + 1_800n, vetoed: false };
    const pool = snapshot({
      committed: 10n * ETH,
      head,
      latest: head,
      settlementCount: 1,
      timestamp: DEPLOYED + 2n * DAY,
    });
    const work = [{ nodeKey: address(0x3), operator: OPERATOR_B, verified: 1n, units: 1n }];
    const plan = publish(planSettlement(input({ pool, base, fromEpoch: 11, toEpoch: 20, work })));
    assert.equal(plan.budget, 9n * ETH);
    const cumulative = new Map(plan.draft.entitlements.map((entry) => [entry.account, entry.cumulative]));
    assert.equal(cumulative.get(OPERATOR_A), 4n * ETH);
    assert.equal(cumulative.get(OPERATOR_B), 15n * ETH);
    assert.equal(plan.draft.total, 19n * ETH);
    assert.equal(plan.draft.total, pool.releasable);
    assert.equal(plan.draft.previousIndex, 1);
  });

  it('waits while a settlement is inside its challenge delay, unless it was vetoed', () => {
    const latest = { index: 2, publishedAt: DEPLOYED + DAY - 10n, claimableAt: DEPLOYED + DAY + 100n, vetoed: false };
    const pending = planSettlement(input({ pool: snapshot({ latest, settlementCount: 2 }) }));
    assert.deepEqual(pending, { kind: 'skip', reason: 'settlement 2 is still inside its challenge delay' });
    const vetoedPool = snapshot({ latest: { ...latest, vetoed: true }, settlementCount: 2 });
    const vetoed = planSettlement(input({ pool: vetoedPool }));
    assert.equal(vetoed.kind, 'publish');
  });

  it('skips with a reason when there is no budget or no paid work', () => {
    const empty = planSettlement(input({ pool: snapshot({ totalBurned: 0n }) }));
    assert.deepEqual(empty, { kind: 'skip', reason: 'the release budget is zero' });
    const idleNetwork = planSettlement(input({ work: [] }));
    assert.deepEqual(idleNetwork, { kind: 'skip', reason: 'there is no paid work to settle' });
    const idle: RigWork[] = [{ nodeKey: address(1), operator: OPERATOR_A, verified: 5n, units: 0n }];
    assert.equal(planSettlement(input({ work: idle })).kind, 'skip');
  });

  it('refuses to build on a history that does not match the chain', () => {
    const head = { index: 1, publishedAt: DEPLOYED, claimableAt: DEPLOYED, vetoed: false };
    const settled = snapshot({ head, latest: head, settlementCount: 1, committed: 5n });
    const missing = planSettlement(input({ pool: settled }));
    assert.equal(missing.kind, 'skip');
    const entitlements = new Map([[OPERATOR_A, 4n]]);
    const base: BaseSettlement = { index: 1, toEpoch: 3, epochSeconds: 3_600, entitlements };
    const drifted = planSettlement(input({ base, pool: settled }));
    assert.deepEqual(drifted, {
      kind: 'skip',
      reason: 'the recorded entitlements do not add up to the total committed on-chain',
    });
  });

  it('never returns a total above what the contract says is releasable', () => {
    assert.throws(() => planSettlement(input({ pool: snapshot({ releasable: 5n * ETH }) })), SettlementGuardError);
  });

  it('stays within the release limit across random pools and work', () => {
    const random = seededRandom(11);
    for (let round = 0; round < 300; round += 1) {
      const pool = snapshot({
        totalBurned: BigInt(random.int(1_000_000)) * 10n ** 12n + 1n,
        releaseBpsPerDay: BigInt(1 + random.int(10_000)),
        timestamp: DEPLOYED + BigInt(random.int(40 * 86_400)),
      });
      const work = Array.from({ length: 1 + random.int(20) }, (_, i) => {
        const units = BigInt(random.int(5_000));
        return { nodeKey: address(0x100 + i), operator: address(1 + random.int(6)), verified: units * 2n, units };
      });
      const plan = planSettlement(input({ pool, work }));
      if (plan.kind === 'publish') {
        assert.ok(plan.draft.total <= pool.releasable);
        assert.ok(plan.draft.total <= pool.totalBurned);
        assert.equal(plan.draft.total, plan.draft.entitlements.reduce((sum, entry) => sum + entry.cumulative, 0n));
      }
    }
  });
});

describe('epochRange', () => {
  it('covers every completed epoch since the base settlement', () => {
    assert.deepEqual(epochRange(null, 5), { fromEpoch: 0, toEpoch: 4 });
    const after = (toEpoch: number): BaseSettlement => ({
      index: 1,
      toEpoch,
      epochSeconds: 3_600,
      entitlements: new Map(),
    });
    assert.deepEqual(epochRange(after(4), 9), { fromEpoch: 5, toEpoch: 8 });
    assert.equal(epochRange(after(8), 9), null);
  });
});
