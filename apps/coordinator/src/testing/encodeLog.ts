import { encodeAbiParameters, encodeEventTopics, type AbiEvent, type Log } from 'viem';
import type { Address, Hex } from '@minera/shared';
import { indexedEvents } from '../chain/abi.ts';

const hex32 = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

/** An RPC log for one of the indexed events, ABI-encoded the way a node serves it, for tests. */
export function encodeLog(
  address: Address,
  eventName: (typeof indexedEvents)[number]['name'],
  args: Record<string, unknown>,
  blockNumber: bigint,
  logIndex: number,
): Log {
  const event = indexedEvents.find((entry) => entry.name === eventName) as AbiEvent;
  const topics = encodeEventTopics({ abi: [event], eventName, args } as Parameters<typeof encodeEventTopics>[0]);
  const plain = event.inputs.filter((input) => !input.indexed);
  const data = encodeAbiParameters(plain, plain.map((input) => args[input.name ?? '']));
  return {
    address,
    topics: topics as [Hex, ...Hex[]],
    data,
    blockNumber,
    blockHash: hex32(Number(blockNumber % 1_000_000n)),
    transactionHash: hex32(Number(blockNumber % 1_000_000n) * 100 + logIndex),
    transactionIndex: 0,
    logIndex,
    removed: false,
  };
}
