import {
  parseEventLogs,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  type TransactionReceipt,
} from 'viem';
import type { Address, Hex } from '@dayagpu/shared';
import { burnPoolEvents } from '../chain/abi.ts';
import type { ChainClient } from '../chain/client.ts';
import type { PublishedSettlement } from '../store/records.ts';

export type ReceiptReader = Pick<ChainClient, 'getTransactionReceipt' | 'waitForTransactionReceipt' | 'getBlock'>;

export type Confirmation =
  | { status: 'pending' }
  | { status: 'reverted' }
  | { status: 'published'; settlement: PublishedSettlement };

async function receiptOf(client: ReceiptReader, hash: Hex, waitMs: number): Promise<TransactionReceipt | null> {
  try {
    return waitMs > 0
      ? await client.waitForTransactionReceipt({ hash, timeout: waitMs })
      : await client.getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError || error instanceof WaitForTransactionReceiptTimeoutError) {
      return null;
    }
    throw error;
  }
}

/**
 * Find out what became of a publish transaction. The settlement index and times come from the
 * receipt's event and block, as the RPC reports them. Needs no key, so it also runs in dry mode.
 */
export async function confirmPublish(
  client: ReceiptReader,
  pool: Address,
  hash: Hex,
  waitMs = 0,
): Promise<Confirmation> {
  const receipt = await receiptOf(client, hash, waitMs);
  if (!receipt) return { status: 'pending' };
  if (receipt.status !== 'success') return { status: 'reverted' };

  const [event] = parseEventLogs({
    abi: burnPoolEvents,
    eventName: 'SettlementPublished',
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === pool.toLowerCase()),
    strict: true,
  });
  if (!event) throw new Error(`transaction ${hash} emitted no SettlementPublished event`);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (event.args.index > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('settlement index is out of range');
  return {
    status: 'published',
    settlement: {
      index: Number(event.args.index),
      root: event.args.root,
      total: event.args.total,
      inputsDigest: event.args.inputs,
      txHash: hash,
      blockNumber: receipt.blockNumber,
      publishedAt: new Date(Number(block.timestamp) * 1000),
      claimableAt: new Date(Number(event.args.claimableAt) * 1000),
    },
  };
}
