import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address, Hex } from '@dayagpu/shared';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { useWallet } from '../wallet/useWallet.ts';
import { describeTransactionError } from './revert.ts';
import { call, sendTransaction, waitForReceipt, walletChainId, type Receipt } from './rpc.ts';

export type TransactionState =
  | { phase: 'idle' }
  /** The call is simulated first, so a transaction that would revert is never offered for signing. */
  | { phase: 'checking' }
  | { phase: 'confirming' }
  | { phase: 'pending'; hash: Hex }
  | { phase: 'confirmed'; hash: Hex; receipt: Receipt }
  | { phase: 'failed'; message: string; hash: Hex | null };

interface TransactionRequest {
  to: Address;
  data: Hex;
}

export interface Transaction {
  state: TransactionState;
  /** Simulates, asks the wallet to sign and send, then waits for the receipt. */
  send: (request: TransactionRequest) => Promise<void>;
  reset: () => void;
}

const WRONG_NETWORK = `Your wallet is on another network. Switch to ${ACTIVE_CHAIN.name} and try again.`;
const REVERTED = 'The transaction was included but reverted, so nothing changed. Check the details and try again.';
const LOST_TRACK = 'The wallet stopped reporting on the transaction. Check it on the explorer before trying again.';

export function useTransaction(): Transaction {
  const { wallet, address } = useWallet();
  const [state, setState] = useState<TransactionState>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const send = useCallback(
    async ({ to, data }: TransactionRequest) => {
      if (!wallet || !address) return;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      const provider = wallet.provider;
      const update = (next: TransactionState) => {
        if (!current.signal.aborted) setState(next);
      };

      let hash: Hex | null = null;
      try {
        update({ phase: 'checking' });
        if ((await walletChainId(provider)) !== ACTIVE_CHAIN.id) {
          update({ phase: 'failed', message: WRONG_NETWORK, hash: null });
          return;
        }
        await call(provider, { from: address, to, data });
        update({ phase: 'confirming' });
        hash = await sendTransaction(provider, { from: address, to, data });
        update({ phase: 'pending', hash });
        const receipt = await waitForReceipt(provider, hash, current.signal);
        if (receipt.status === 'reverted') update({ phase: 'failed', message: REVERTED, hash });
        else update({ phase: 'confirmed', hash, receipt });
      } catch (cause) {
        update({ phase: 'failed', message: hash ? LOST_TRACK : describeTransactionError(cause), hash });
      }
    },
    [wallet, address],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ phase: 'idle' });
  }, []);

  return { state, send, reset };
}
