import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { TransactionReceiptNotFoundError, type TransactionReceipt } from 'viem';
import { releasable, type Address, type Hex } from '@dayagpu/shared';
import { poolState, type PoolSnapshot } from '../chain/pool.ts';
import { epochOf } from '../epoch.ts';
import { createMemoryStore } from '../store/memory/index.ts';
import type { SettlementDraft } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { encodeLog } from '../testing/encodeLog.ts';
import type { ReceiptReader } from './confirm.ts';
import type { Publisher } from './publisher.ts';
import { nextRoundDelay, settleOnce, type SettlementWorkerDeps } from './worker.ts';

const ETH = 10n ** 18n;
const EPOCH_SECONDS = 3_600;
const NOW = new Date('2026-09-29T12:30:00Z');
const CHAIN_NOW = BigInt(NOW.getTime() / 1000);
const POOL = '0x00000000000000000000000000000000000000f0' as Address;
const PUBLISHER = '0x00000000000000000000000000000000000000e1' as Address;
const OPERATOR = '0x00000000000000000000000000000000000000a1' as Address;
const RIG = '0x00000000000000000000000000000000000000b1' as Address;
const TX = `0x${'77'.repeat(32)}` as Hex;

function snapshot(overrides: Partial<PoolSnapshot> = {}): PoolSnapshot {
  const base: PoolSnapshot = {
    blockNumber: 5_000n,
    timestamp: CHAIN_NOW,
    totalBurned: 10n * ETH,
    committed: 0n,
    releasable: 0n,
    head: null,
    latest: null,
    settlementCount: 0,
    deployedAt: CHAIN_NOW - 86_400n,
    releaseBpsPerDay: 1_000n,
    challengeDelay: 1_800n,
    publisher: PUBLISHER,
    ...overrides,
  };
  return { ...base, releasable: releasable(poolState(base), base.timestamp) };
}

/** A chain that mines whatever the publisher sends, emitting the event the pool would. */
function fakeChain(sent: SettlementDraft[], mined: boolean): ReceiptReader {
  const receipt = (): TransactionReceipt => {
    const draft = sent.at(-1);
    assert.ok(draft);
    const log = encodeLog(
      POOL,
      'SettlementPublished',
      { index: 1n, root: draft.root, total: draft.total, claimableAt: CHAIN_NOW + 1_800n, inputs: draft.inputsDigest },
      9_000n,
      0,
    );
    return { status: 'success', blockNumber: 9_000n, logs: [log] } as unknown as TransactionReceipt;
  };
  const missing = () => {
    throw new TransactionReceiptNotFoundError({ hash: TX });
  };
  return {
    waitForTransactionReceipt: async () => (mined ? receipt() : missing()),
    getTransactionReceipt: async () => (mined ? receipt() : missing()),
    getBlock: async () => ({ timestamp: CHAIN_NOW + 5n }),
  } as unknown as ReceiptReader;
}

function publisher(sent: SettlementDraft[], address = PUBLISHER, fail = false): Publisher {
  return {
    address,
    send: async (draft) => {
      if (fail) throw new Error('execution reverted: SettlementPending(1)');
      sent.push(draft as SettlementDraft);
      return TX;
    },
  };
}

let store: Store;
let sent: SettlementDraft[];

function deps(overrides: Partial<SettlementWorkerDeps> = {}): SettlementWorkerDeps {
  return {
    store,
    readPool: async () => snapshot(),
    client: fakeChain(sent, true),
    publisher: publisher(sent),
    now: () => NOW,
    epochSeconds: EPOCH_SECONDS,
    chainId: 46630,
    burnPool: POOL,
    ...overrides,
  };
}

beforeEach(async () => {
  store = createMemoryStore();
  sent = [];
  await store.rigs.deploy({ nodeKey: RIG, operator: OPERATOR, pair: POOL, name: 'rig', deployedAt: NOW, deployedBlock: 1n });
  await store.work.credit(RIG, epochOf(NOW, EPOCH_SECONDS) - 1, { verified: 40, unverified: 7 });
});

describe('settleOnce', () => {
  it('plans but never sends in dry mode', async () => {
    const outcome = await settleOnce(deps({ publisher: null }));
    assert.equal(outcome.kind, 'skipped');
    assert.match(outcome.kind === 'skipped' ? outcome.reason : '', /^dry mode without a publisher key; would publish root 0x/);
    assert.deepEqual([sent.length, (await store.settlements.recent(5)).length], [0, 0]);
  });

  it('publishes, records the index from the event and serves the entitlements', async () => {
    const outcome = await settleOnce(deps());
    assert.deepEqual(outcome, { kind: 'published', index: 1, txHash: TX, total: ETH });
    const settlement = await store.settlements.byIndex(1);
    assert.deepEqual([settlement?.status, settlement?.txHash, settlement?.blockNumber], ['published', TX, 9_000n]);
    assert.deepEqual(settlement?.publishedAt, new Date(Number(CHAIN_NOW + 5n) * 1000));
    assert.ok(settlement);
    const [entitlement] = await store.settlements.entitlements(settlement.id);
    assert.deepEqual([entitlement?.account, entitlement?.cumulative], [OPERATOR, ETH]);
    assert.equal(JSON.parse(settlement.inputs ?? '{}').toEpoch, epochOf(NOW, EPOCH_SECONDS) - 1);
  });

  it('skips while the published settlement is inside its challenge delay', async () => {
    await settleOnce(deps());
    const head = { index: 1, publishedAt: CHAIN_NOW, claimableAt: CHAIN_NOW + 1_800n, vetoed: false };
    const pending = snapshot({ committed: ETH, head, latest: head, settlementCount: 1 });
    const outcome = await settleOnce(deps({ readPool: async () => pending, now: () => new Date(NOW.getTime() + 3_600_000) }));
    assert.deepEqual(outcome, { kind: 'skipped', reason: 'settlement 1 is still inside its challenge delay' });
  });

  it('does not send with a key that is not the pool publisher', async () => {
    const outcome = await settleOnce(deps({ publisher: publisher(sent, OPERATOR) }));
    assert.equal(outcome.kind, 'skipped');
    assert.equal(sent.length, 0);
  });

  it('marks the draft failed when sending fails', async () => {
    const outcome = await settleOnce(deps({ publisher: publisher(sent, PUBLISHER, true) }));
    assert.deepEqual(outcome, { kind: 'failed', reason: 'execution reverted: SettlementPending(1)' });
    assert.deepEqual(await store.settlements.open(), []);
  });

  it('waits for an unconfirmed transaction before planning another', async () => {
    const outcome = await settleOnce(deps({ client: fakeChain(sent, false) }));
    assert.deepEqual(outcome, { kind: 'sent', txHash: TX });
    const again = await settleOnce(deps({ client: fakeChain(sent, false) }));
    assert.equal(again.kind, 'waiting');
    const confirmed = await settleOnce(deps());
    assert.deepEqual(confirmed, { kind: 'waiting', reason: 'settlement 1 was confirmed' });
    assert.equal((await store.settlements.byIndex(1))?.status, 'published');
    const stale = await settleOnce(deps());
    assert.deepEqual(stale, { kind: 'skipped', reason: 'the chain read is behind settlement 1; waiting for it to catch up' });
    assert.equal(sent.length, 1);
  });
});

describe('nextRoundDelay', () => {
  it('runs a minute after the epoch ends, or a minute from now to follow up a transaction', () => {
    assert.equal(nextRoundDelay(null, NOW, EPOCH_SECONDS), 30 * 60_000 + 60_000);
    assert.equal(nextRoundDelay({ kind: 'sent', txHash: TX }, NOW, EPOCH_SECONDS), 60_000);
  });
});
