import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { CloseIcon } from '../components/icons.tsx';
import { trapTab } from '../lib/focusTrap.ts';
import { AccountPanel } from './AccountPanel.tsx';
import { useWallet } from './useWallet.ts';
import { WalletList } from './WalletList.tsx';
import './connect-dialog.css';

interface ConnectDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A native modal dialog: the page behind it is inert, Escape closes it and the browser draws the
 * backdrop. Tab is kept inside it as well.
 */
export function ConnectDialog({ open, onClose }: ConnectDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { status, error } = useWallet();
  const connected = status === 'connected';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

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
            {connected ? 'Wallet' : 'Connect a wallet'}
          </h2>
          <button type="button" className="wallet-dialog__close" onClick={onClose}>
            <CloseIcon />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {connected ? <AccountPanel /> : <WalletList />}
        {error && (
          <p className="wallet-dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
