import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { CloseIcon } from '../components/icons.tsx';
import { trapTab } from '../lib/focusTrap.ts';
import { AccountPanel } from './AccountPanel.tsx';
import { NetworkPrompt } from './NetworkPrompt.tsx';
import { useWallet } from './useWallet.ts';
import { WalletList } from './WalletList.tsx';
import './connect-dialog.css';

type View = 'connect' | 'network' | 'account';

const TITLES: Readonly<Record<View, string>> = {
  connect: 'Connect a wallet',
  network: 'Switch network',
  account: 'Wallet',
};

interface ConnectDialogProps {
  open: boolean;
  onClose: () => void;
}

function focusFirstAction(dialog: HTMLDialogElement): void {
  dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
}

/**
 * A native modal dialog: the page behind it is inert, Escape closes it and the browser draws the
 * backdrop. Tab is kept inside it as well.
 */
export function ConnectDialog({ open, onClose }: ConnectDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { status, isCorrectNetwork, error } = useWallet();
  const view: View = status !== 'connected' ? 'connect' : isCorrectNetwork ? 'account' : 'network';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      focusFirstAction(dialog);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The focused control may leave with the old view, so focus moves to the new view's first action.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.open) focusFirstAction(dialog);
  }, [view]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Tab') trapTab(event, event.currentTarget);
  };

  // A click that lands on the dialog element itself, not its panel, is a click on the backdrop.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="wallet-dialog"
      aria-labelledby="wallet-dialog-title"
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      <div className="wallet-dialog__panel">
        <div className="wallet-dialog__head">
          <h2 className="wallet-dialog__title" id="wallet-dialog-title">
            {TITLES[view]}
          </h2>
          <button type="button" className="wallet-dialog__close" onClick={onClose}>
            <CloseIcon />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {view === 'connect' && <WalletList />}
        {view === 'network' && <NetworkPrompt />}
        {view === 'account' && <AccountPanel />}
        {error && (
          <p className="wallet-dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
