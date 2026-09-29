import type { Deployment } from '@dayagpu/shared';
import type { Store } from '../store/store.ts';
import { indexedEvents } from './abi.ts';
import { applyChainEvents } from './apply.ts';
import type { ChainClient } from './client.ts';
import { toChainEvent, type ChainEvent } from './events.ts';

/** Blocks per log request, small enough for public endpoints' range limits. */
export const LOG_RANGE = 5_000n;

export type ChainReader = Pick<ChainClient, 'getBlockNumber' | 'getBlock' | 'getLogs'>;

export interface IndexerDeps {
  client: ChainReader;
  store: Store;
  deployment: Deployment;
  range?: bigint;
}

export interface IndexedRange {
  from: bigint;
  to: bigint;
  events: number;
  /** Whether the cursor reached the head the range was planned against. */
  caughtUp: boolean;
}

async function blockTimes(client: ChainReader, blockNumbers: Iterable<bigint>): Promise<Map<bigint, Date>> {
  const times = new Map<bigint, Date>();
  for (const blockNumber of new Set(blockNumbers)) {
    const block = await client.getBlock({ blockNumber });
    times.set(blockNumber, new Date(Number(block.timestamp) * 1000));
  }
  return times;
}

/**
 * Read the next bounded range of registry and pool logs after the stored cursor and apply them.
 * Resolves `null` when there is nothing new. Block numbers come from the RPC logs, never from
 * the contracts, because `block.number` inside this chain is the parent chain's height.
 */
export async function indexNextRange(deps: IndexerDeps): Promise<IndexedRange | null> {
  const { client, store, deployment } = deps;
  const range = deps.range ?? LOG_RANGE;
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const cursor = (await store.chain.cursor()) ?? BigInt(deployment.startBlock) - 1n;
  if (cursor >= head) return null;

  const from = cursor + 1n;
  const to = cursor + range < head ? cursor + range : head;
  const logs = await client.getLogs({
    address: [deployment.rigRegistry, deployment.burnPool],
    events: indexedEvents,
    fromBlock: from,
    toBlock: to,
    strict: true,
  });

  const times = await blockTimes(client, logs.map((log) => log.blockNumber));
  const sources = { rigRegistry: deployment.rigRegistry, burnPool: deployment.burnPool };
  const events: ChainEvent[] = [];
  for (const log of logs) {
    const time = times.get(log.blockNumber);
    if (!time) throw new Error(`missing timestamp for block ${log.blockNumber}`);
    const event = toChainEvent(log, time, sources);
    if (event) events.push(event);
  }

  await applyChainEvents(store, events, to);
  return { from, to, events: events.length, caughtUp: to === head };
}
