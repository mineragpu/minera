/**
 * Refunds go out from a small hot wallet, one at a time. Each refund's transaction is signed and
 * saved before it is first broadcast, so after a restart the same transaction is sent again rather
 * than a second refund.
 */

import { createWalletClient, keccak256, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, ChainConfig, Hex } from '@minera/shared';
import { chainDefinition, rpcTransport, type ChainClient } from '../chain/client.ts';
import type { Secret } from '../secret.ts';
import type { RefundRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import type { RentalLog } from './service.ts';

export interface RefundWallet {
  address: Address;
  balance(): Promise<bigint>;
  /** Signs a plain transfer at the wallet's next nonce, without sending it. */
  sign(to: Address, wei: bigint): Promise<{ raw: Hex; hash: Hex }>;
  /** Sends a signed transaction; sending one the chain already has is not an error. */
  broadcast(raw: Hex): Promise<void>;
  /** Whether the transaction succeeded, or null while it is not mined. */
  outcome(hash: Hex): Promise<boolean | null>;
}

/** A refund transaction not mined after this long needs a person to look at it. */
const STUCK_MS = 30 * 60_000;

export function createRefundWallet(
  key: Secret<Hex>,
  chain: ChainConfig,
  rpcUrls: readonly string[],
  client: Pick<ChainClient, 'getBalance' | 'getTransactionCount' | 'estimateFeesPerGas' | 'getTransactionReceipt'>,
): RefundWallet {
  const account: Account & { address: Address } = privateKeyToAccount(key.reveal());
  const wallet = createWalletClient({ account, chain: chainDefinition(chain), transport: rpcTransport(rpcUrls) });
  return {
    address: account.address.toLowerCase() as Address,
    balance: () => client.getBalance({ address: account.address }),
    async sign(to, wei) {
      const [nonce, fees] = await Promise.all([
        client.getTransactionCount({ address: account.address, blockTag: 'pending' }),
        client.estimateFeesPerGas(),
      ]);
      const request = await wallet.prepareTransactionRequest({
        to,
        value: wei,
        nonce,
        gas: 21_000n,
        maxFeePerGas: fees.maxFeePerGas * 2n,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      const raw = await wallet.signTransaction(request);
      return { raw, hash: keccak256(raw) };
    },
    async broadcast(raw) {
      try {
        await wallet.sendRawTransaction({ serializedTransaction: raw });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!/already known|nonce too low|known transaction/i.test(message)) throw error;
      }
    },
    async outcome(hash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return receipt.status === 'success';
      } catch (error) {
        if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null;
        throw error;
      }
    },
  };
}

/**
 * Moves the oldest open refund one step: sign and save it, then send it; or send it again and see
 * whether it landed. Only one refund is in flight at a time, so nonces never cross.
 */
export async function processRefunds(store: Store, wallet: RefundWallet, now: Date, log: RentalLog): Promise<void> {
  const [refund] = await store.rentals.openRefunds(1);
  if (!refund) return;
  const save = (next: RefundRecord) => store.rentals.saveRefund({ ...next, updatedAt: now });

  if (refund.rawTx === null || refund.txHash === null) {
    const balance = await wallet.balance();
    if (balance < refund.wei + 10n ** 14n) {
      log.warn({ refund: refund.id, wei: refund.wei.toString() }, 'the refund wallet is too low to send a refund');
      return;
    }
    const signed = await wallet.sign(refund.recipient, refund.wei);
    await save({ ...refund, rawTx: signed.raw, txHash: signed.hash, status: 'sent' });
    await wallet.broadcast(signed.raw);
    log.info({ refund: refund.id, txHash: signed.hash, wei: refund.wei.toString() }, 'refund sent');
    return;
  }

  const outcome = await wallet.outcome(refund.txHash);
  if (outcome === true) {
    await save({ ...refund, status: 'done' });
    log.info({ refund: refund.id, txHash: refund.txHash }, 'refund confirmed');
    return;
  }
  if (outcome === false) {
    log.error({ refund: refund.id, txHash: refund.txHash }, 'a refund transaction failed; it needs a person');
    return;
  }
  await wallet.broadcast(refund.rawTx);
  if (now.getTime() - refund.updatedAt.getTime() > STUCK_MS) {
    log.error({ refund: refund.id, txHash: refund.txHash }, 'a refund has not been mined for 30 minutes; it needs a person');
  }
}
