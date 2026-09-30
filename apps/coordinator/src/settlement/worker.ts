import type { Address, Hex } from '@minera/shared';
import type { PoolSnapshot } from '../chain/pool.ts';
import { epochOf, epochStart } from '../epoch.ts';
import { errorSummary } from '../log.ts';
import type { Store } from '../store/store.ts';
import { confirmPublish, isTransactionKnown, type ReceiptReader } from './confirm.ts';
import { epochSecondsOf } from './inputs.ts';
import { epochRange, planSettlement, type BaseSettlement } from './plan.ts';
import type { Publisher } from './publisher.ts';

export interface SettlementWorkerDeps {
  store: Store;
  readPool: () => Promise<PoolSnapshot>;
  client: ReceiptReader;
  /** `null` in dry mode: settlements are planned and logged, never sent. */
  publisher: Publisher | null;
  now: () => Date;
  epochSeconds: number;
  chainId: number;
  burnPool: Address;
}

export type SettleOutcome =
  | { kind: 'skipped'; reason: string }
  | { kind: 'waiting'; reason: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'sent'; txHash: Hex }
  | { kind: 'published'; index: number; txHash: Hex; total: bigint };

/** A draft still without a transaction hash after this long was never sent. */
const SENDING_GRACE_MS = 10 * 60_000;
/** A sent transaction no RPC knows after this long was dropped and will not be mined. */
const DROPPED_AFTER_MS = 15 * 60_000;
const RECEIPT_WAIT_MS = 90_000;
/** Settle a little after each epoch ends, so results verified at the boundary are included. */
const EPOCH_GRACE_MS = 60_000;
const RETRY_MS = 60_000;

/** Settle drafts left open by an earlier run before planning a new one. */
async function reconcile(deps: SettlementWorkerDeps): Promise<SettleOutcome | null> {
  const { store } = deps;
  for (const draft of await store.settlements.open()) {
    if (draft.status === 'sent' && draft.txHash) {
      const confirmation = await confirmPublish(deps.client, deps.burnPool, draft.txHash);
      if (confirmation.status === 'pending') {
        const age = deps.now().getTime() - draft.createdAt.getTime();
        if (age >= DROPPED_AFTER_MS && !(await isTransactionKnown(deps.client, draft.txHash))) {
          await store.settlements.markFailed(draft.id, 'the publish transaction was dropped before it was mined');
          continue;
        }
        return { kind: 'waiting', reason: `transaction ${draft.txHash} is not confirmed yet` };
      }
      if (confirmation.status === 'reverted') {
        await store.settlements.markFailed(draft.id, 'the publish transaction reverted');
        continue;
      }
      await store.settlements.recordPublished(confirmation.settlement);
      // Plan the next one from a later read, once the chain state reflects this settlement.
      return { kind: 'waiting', reason: `settlement ${confirmation.settlement.index} was confirmed` };
    }
    if (deps.now().getTime() - draft.createdAt.getTime() < SENDING_GRACE_MS) {
      return { kind: 'waiting', reason: 'a settlement is being sent' };
    }
    await store.settlements.markFailed(draft.id, 'the publish transaction was never confirmed as sent');
  }
  return null;
}

async function baseSettlement(store: Store, pool: PoolSnapshot): Promise<BaseSettlement | null | string> {
  const known = (await store.settlements.recent(10)).find((row) => row.status === 'published' && !row.vetoed);
  if (known?.index && known.index > (pool.head?.index ?? 0)) {
    return `the chain read is behind settlement ${known.index}; waiting for it to catch up`;
  }
  if (!pool.head) return null;
  const row = await store.settlements.byIndex(pool.head.index);
  const epochSeconds = row?.inputs ? epochSecondsOf(row.inputs) : null;
  if (!row || row.toEpoch === null || epochSeconds === null) {
    return `settlement ${pool.head.index} has no local record to build on`;
  }
  const entitlements = await store.settlements.entitlements(row.id);
  return {
    index: pool.head.index,
    toEpoch: row.toEpoch,
    epochSeconds,
    entitlements: new Map(entitlements.map((entry) => [entry.account, entry.cumulative])),
  };
}

/**
 * One settlement round: reconcile open drafts, plan from fresh pool state and the verified work of
 * every epoch completed since the head settlement, then store the draft and publish it.
 */
export async function settleOnce(deps: SettlementWorkerDeps): Promise<SettleOutcome> {
  const { store } = deps;
  const waiting = await reconcile(deps);
  if (waiting) return waiting;

  const pool = await deps.readPool();
  const base = await baseSettlement(store, pool);
  if (typeof base === 'string') return { kind: 'skipped', reason: base };
  if (base && base.epochSeconds !== deps.epochSeconds) {
    return {
      kind: 'skipped',
      reason:
        `EPOCH_SECONDS changed from ${base.epochSeconds} to ${deps.epochSeconds} after settlement ${base.index}; ` +
        'epoch numbers no longer line up, so settlement waits until it is set back',
    };
  }
  const now = deps.now();
  const range = epochRange(base, epochOf(now, deps.epochSeconds));
  if (!range) return { kind: 'skipped', reason: 'no epoch has completed since the last settlement' };

  const plan = planSettlement({
    pool,
    base,
    ...range,
    work: await store.work.verifiedByRig(range.fromEpoch, range.toEpoch),
    chainId: deps.chainId,
    burnPool: deps.burnPool,
    epochSeconds: deps.epochSeconds,
    createdAt: now,
  });
  if (plan.kind === 'skip') return { kind: 'skipped', reason: plan.reason };

  const summary = `root ${plan.draft.root}, total ${plan.draft.total} wei to ${plan.accounts} accounts`;
  if (!deps.publisher) return { kind: 'skipped', reason: `dry mode without a publisher key; would publish ${summary}` };
  if (deps.publisher.address !== pool.publisher) {
    return { kind: 'skipped', reason: `the configured key is not the pool publisher; would publish ${summary}` };
  }

  const id = await store.transaction((tx) => tx.settlements.createDraft(plan.draft));
  let txHash: Hex;
  try {
    txHash = await deps.publisher.send(plan.draft);
  } catch (error) {
    const reason = errorSummary(error).message;
    await store.settlements.markFailed(id, reason);
    return { kind: 'failed', reason };
  }
  await store.settlements.markSent(id, txHash);

  const confirmation = await confirmPublish(deps.client, deps.burnPool, txHash, RECEIPT_WAIT_MS);
  if (confirmation.status === 'pending') return { kind: 'sent', txHash };
  if (confirmation.status === 'reverted') {
    await store.settlements.markFailed(id, 'the publish transaction reverted');
    return { kind: 'failed', reason: `transaction ${txHash} reverted` };
  }
  await store.settlements.recordPublished(confirmation.settlement);
  return { kind: 'published', index: confirmation.settlement.index, txHash, total: plan.draft.total };
}

/** When to run the next round: shortly after the current epoch ends, or sooner to follow up a transaction. */
export function nextRoundDelay(outcome: SettleOutcome | null, now: Date, epochSeconds: number): number {
  if (outcome && (outcome.kind === 'waiting' || outcome.kind === 'sent')) return RETRY_MS;
  const nextEpoch = epochStart(epochOf(now, epochSeconds) + 1, epochSeconds);
  return nextEpoch.getTime() + EPOCH_GRACE_MS - now.getTime();
}
