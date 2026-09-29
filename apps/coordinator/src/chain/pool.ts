import type { Address, PoolState } from '@dayagpu/shared';
import { burnPoolAbi } from './abi.ts';
import type { ChainClient } from './client.ts';

export interface SettlementSlot {
  index: number;
  publishedAt: bigint;
  claimableAt: bigint;
  vetoed: boolean;
}

/** The Burn Pool as of one block, every value read at that same block. */
export interface PoolSnapshot {
  blockNumber: bigint;
  /** That block's timestamp in unix seconds: the clock the contract checks against. */
  timestamp: bigint;
  totalBurned: bigint;
  committed: bigint;
  /** The contract's own `releasable()` at this block. */
  releasable: bigint;
  head: SettlementSlot | null;
  /** The newest settlement, vetoed or not; it blocks publishing until its delay has passed. */
  latest: SettlementSlot | null;
  settlementCount: number;
  deployedAt: bigint;
  releaseBpsPerDay: bigint;
  challengeDelay: bigint;
  publisher: Address;
}

export type PoolReader = Pick<ChainClient, 'getBlock' | 'readContract'>;

function toIndex(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`settlement index ${value} is out of range`);
  return Number(value);
}

export async function readPoolSnapshot(client: PoolReader, pool: Address): Promise<PoolSnapshot> {
  const block = await client.getBlock({ blockTag: 'latest' });
  const at = { address: pool, abi: burnPoolAbi, blockNumber: block.number } as const;
  const [
    totalBurned,
    committed,
    releasable,
    head,
    settlementCount,
    deployedAt,
    releaseBpsPerDay,
    challengeDelay,
    publisher,
  ] = await Promise.all([
    client.readContract({ ...at, functionName: 'totalBurned' }),
    client.readContract({ ...at, functionName: 'committed' }),
    client.readContract({ ...at, functionName: 'releasable' }),
    client.readContract({ ...at, functionName: 'head' }),
    client.readContract({ ...at, functionName: 'settlementCount' }),
    client.readContract({ ...at, functionName: 'deployedAt' }),
    client.readContract({ ...at, functionName: 'releaseBpsPerDay' }),
    client.readContract({ ...at, functionName: 'challengeDelay' }),
    client.readContract({ ...at, functionName: 'publisher' }),
  ]);

  const slot = async (index: bigint): Promise<SettlementSlot | null> => {
    if (index === 0n) return null;
    const [, , publishedAt, claimableAt, vetoed] = await client.readContract({
      ...at,
      functionName: 'settlements',
      args: [index],
    });
    return { index: toIndex(index), publishedAt, claimableAt, vetoed };
  };
  const headSlot = await slot(head);
  const latestSlot = settlementCount === head ? headSlot : await slot(settlementCount);

  return {
    blockNumber: block.number,
    timestamp: block.timestamp,
    totalBurned,
    committed,
    releasable,
    head: headSlot,
    latest: latestSlot,
    settlementCount: toIndex(settlementCount),
    deployedAt,
    releaseBpsPerDay,
    challengeDelay,
    publisher: publisher.toLowerCase() as Address,
  };
}

/** The inputs of the shared release math, as the contract computes them. */
export function poolState(snapshot: PoolSnapshot): PoolState {
  return {
    totalBurned: snapshot.totalBurned,
    committed: snapshot.committed,
    since: snapshot.head ? snapshot.head.publishedAt : snapshot.deployedAt,
    releaseBpsPerDay: snapshot.releaseBpsPerDay,
  };
}
