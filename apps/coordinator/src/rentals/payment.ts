/**
 * Checks a rental payment on chain: a successful plain ETH transfer to the rental address whose data
 * is exactly the rental's id. The chain is read through `PaymentReader`, so tests need no node.
 */

import type { Address, Hex } from '@minera/shared';
import type { ChainClient } from '../chain/client.ts';

export interface PaymentTransaction {
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
}

export interface PaymentReader {
  /** The transaction, or null when the chain does not know it. */
  transaction(hash: Hex): Promise<PaymentTransaction | null>;
  /** The receipt's outcome and block time, or null while the transaction is not mined. */
  receipt(hash: Hex): Promise<{ success: boolean; at: Date } | null>;
}

export type PaymentCheck =
  | { kind: 'pending' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'paid'; payer: Address; value: bigint; at: Date };

/** The data a payment for this rental carries. */
export function paymentData(rentalId: string): Hex {
  return `0x${rentalId}`;
}

export async function checkPayment(
  reader: PaymentReader,
  hash: Hex,
  payTo: Address,
  rentalId: string,
): Promise<PaymentCheck> {
  const transaction = await reader.transaction(hash);
  if (transaction === null) return { kind: 'pending' };
  if (transaction.to?.toLowerCase() !== payTo.toLowerCase()) {
    return { kind: 'invalid', reason: 'The transaction was not sent to the rental address.' };
  }
  if (transaction.input.toLowerCase() !== paymentData(rentalId)) {
    return { kind: 'invalid', reason: "The transaction's data is not this rental's id." };
  }
  const receipt = await reader.receipt(hash);
  if (receipt === null) return { kind: 'pending' };
  if (!receipt.success) return { kind: 'invalid', reason: 'The transaction failed, so nothing was paid.' };
  return { kind: 'paid', payer: transaction.from.toLowerCase() as Address, value: transaction.value, at: receipt.at };
}

/** Reads payments through the coordinator's chain client. */
export function chainPaymentReader(client: Pick<ChainClient, 'getTransaction' | 'getTransactionReceipt' | 'getBlock'>): PaymentReader {
  return {
    async transaction(hash) {
      try {
        const transaction = await client.getTransaction({ hash });
        return { from: transaction.from, to: transaction.to, value: transaction.value, input: transaction.input };
      } catch (error) {
        if (error instanceof Error && error.name === 'TransactionNotFoundError') return null;
        throw error;
      }
    },
    async receipt(hash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        return { success: receipt.status === 'success', at: new Date(Number(block.timestamp) * 1000) };
      } catch (error) {
        if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null;
        throw error;
      }
    },
  };
}
