import {
  accumulate,
  allocate,
  blockBudget,
  buildSettlement,
  releasable,
  totalOf,
  type Address,
} from '@dayagpu/shared';
import { poolState, type PoolSnapshot } from '../chain/pool.ts';
import type { RigWork, SettlementDraft } from '../store/records.ts';
import { encodeInputs, type SettlementInputs } from './inputs.ts';

/** The settlement the chain's head points at, as this coordinator recorded it. */
export interface BaseSettlement {
  index: number;
  toEpoch: number;
  entitlements: ReadonlyMap<Address, bigint>;
}

export interface PlanInput {
  pool: PoolSnapshot;
  base: BaseSettlement | null;
  fromEpoch: number;
  toEpoch: number;
  work: readonly RigWork[];
  chainId: number;
  burnPool: Address;
  epochSeconds: number;
  createdAt: Date;
}

export type SettlementPlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'publish'; draft: SettlementDraft; budget: bigint; releasable: bigint; accounts: number };

export class SettlementGuardError extends Error {
  override name = 'SettlementGuardError';
}

/** The epochs the next settlement covers: everything completed since the base settlement. */
export function epochRange(
  base: BaseSettlement | null,
  currentEpoch: number,
): { fromEpoch: number; toEpoch: number } | null {
  const fromEpoch = base ? base.toEpoch + 1 : 0;
  const toEpoch = currentEpoch - 1;
  return fromEpoch <= toEpoch ? { fromEpoch, toEpoch } : null;
}

function skip(reason: string): SettlementPlan {
  return { kind: 'skip', reason };
}

function byAddress<T extends { account: Address }>(a: T, b: T): number {
  return a.account < b.account ? -1 : a.account > b.account ? 1 : 0;
}

/**
 * Decide the next settlement from chain state and verified work, as a pure function.
 *
 * The budget is what the pool's release limit adds since the head settlement. It is split across
 * operator accounts by verified units, added to the head's cumulative entitlements, and built into
 * the tree the pool verifies. The total is checked against the release limit before anything is
 * returned for publishing.
 */
export function planSettlement(input: PlanInput): SettlementPlan {
  const { pool, base } = input;
  const now = pool.timestamp;

  if (pool.latest && !pool.latest.vetoed && now < pool.latest.claimableAt) {
    return skip(`settlement ${pool.latest.index} is still inside its challenge delay`);
  }
  const headIndex = pool.head?.index ?? 0;
  if ((base?.index ?? 0) !== headIndex) {
    return skip(`the recorded settlement history does not reach the chain head (settlement ${headIndex})`);
  }
  const baseEntitlements = base?.entitlements ?? new Map<Address, bigint>();
  if (totalOf(baseEntitlements) !== pool.committed) {
    return skip('the recorded entitlements do not add up to the total committed on-chain');
  }

  const state = poolState(pool);
  const budget = blockBudget(state, now);
  if (budget <= 0n) return skip('the release budget is zero');
  const records = input.work
    .filter((entry) => entry.units > 0n)
    .map((entry) => ({ account: entry.operator, units: entry.units }));
  if (records.length === 0) return skip('there is no verified work to settle');

  const allocation = allocate(budget, records);
  if (allocation.size === 0) return skip('the budget is too small to pay any account');
  const entitlements = accumulate(baseEntitlements, allocation);
  const settlement = buildSettlement(entitlements);

  const computed = releasable(state, now);
  const cap = computed < pool.releasable ? computed : pool.releasable;
  if (settlement.total > cap) {
    throw new SettlementGuardError(`settlement total ${settlement.total} is above the releasable ${cap}`);
  }
  if (settlement.total < pool.committed) {
    throw new SettlementGuardError(`settlement total ${settlement.total} is below the committed ${pool.committed}`);
  }

  const inputs: SettlementInputs = {
    version: 1,
    chainId: input.chainId,
    burnPool: input.burnPool.toLowerCase() as Address,
    previousIndex: headIndex,
    fromEpoch: input.fromEpoch,
    toEpoch: input.toEpoch,
    epochSeconds: input.epochSeconds,
    poolBlock: pool.blockNumber.toString(),
    poolTimestamp: now.toString(),
    budget: budget.toString(),
    work: [...input.work]
      .sort((a, b) => (a.nodeKey < b.nodeKey ? -1 : a.nodeKey > b.nodeKey ? 1 : 0))
      .map((entry) => ({ nodeKey: entry.nodeKey, account: entry.operator, units: entry.units.toString() })),
    allocation: [...allocation]
      .map(([account, amount]) => ({ account, amount: amount.toString() }))
      .sort(byAddress),
    entitlements: [...settlement.proofs]
      .map(([account, { cumulative }]) => ({ account, cumulative: cumulative.toString() }))
      .sort(byAddress),
  };
  const encoded = encodeInputs(inputs);

  return {
    kind: 'publish',
    budget,
    releasable: cap,
    accounts: settlement.proofs.size,
    draft: {
      root: settlement.root,
      total: settlement.total,
      inputsDigest: encoded.digest,
      inputs: encoded.json,
      dump: settlement.dump,
      previousIndex: headIndex,
      fromEpoch: input.fromEpoch,
      toEpoch: input.toEpoch,
      entitlements: [...settlement.proofs]
        .map(([account, { cumulative, proof }]) => ({ account, cumulative, proof }))
        .sort(byAddress),
      createdAt: input.createdAt,
    },
  };
}
