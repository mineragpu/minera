import type { ReactNode } from 'react';
import type { Hex } from '@minera/shared';
import type { TransactionState } from '../chain/useTransaction.ts';
import { txUrl } from '../lib/explorer.ts';
import { InlineCode } from './InlineCode.tsx';
import './tx-status.css';

interface TxStatusProps {
  state: TransactionState;
  /** Shown once the transaction is confirmed. */
  confirmed?: ReactNode;
}

function ExplorerLink({ hash }: { hash: Hex }) {
  return (
    <a className="text-link tx__link" href={txUrl(hash)} target="_blank" rel="noreferrer">
      View the transaction on the explorer
    </a>
  );
}

/** Where a transaction stands, in one line, with its hash once the wallet has sent it. */
export function TxStatus({ state, confirmed }: TxStatusProps) {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'checking':
      return (
        <p className="tx" role="status">
          Checking the transaction before your wallet sees it…
        </p>
      );
    case 'confirming':
      return (
        <p className="tx" role="status">
          Confirm the transaction in your wallet.
        </p>
      );
    case 'pending':
      return (
        <div className="tx" role="status">
          <p>Sent. Waiting for the network to include it.</p>
          <p className="tx__hash">{state.hash}</p>
          <ExplorerLink hash={state.hash} />
        </div>
      );
    case 'confirmed':
      return (
        <div className="tx tx--done" role="status">
          {confirmed}
          <ExplorerLink hash={state.hash} />
        </div>
      );
    case 'failed':
      return (
        <div className="tx tx--failed" role="alert">
          <p>
            <InlineCode text={state.message} />
          </p>
          {state.hash && <ExplorerLink hash={state.hash} />}
        </div>
      );
  }
}
