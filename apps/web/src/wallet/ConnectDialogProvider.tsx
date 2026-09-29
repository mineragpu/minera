import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConnectDialog } from './ConnectDialog.tsx';
import { requestWallets } from './discovery.ts';
import { ConnectDialogContext, type ConnectDialogControls } from './useConnectDialog.ts';
import { useWallet } from './useWallet.ts';

export function ConnectDialogProvider({ children }: { children: ReactNode }) {
  const { status, isCorrectNetwork, clearError } = useWallet();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);

  const show = useCallback(
    (from: HTMLElement | null) => {
      trigger.current = from;
      clearError();
      requestWallets();
      setOpen(true);
    },
    [clearError],
  );

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  // Once the visitor is connected on the right network, the dialog has done its job.
  const ready = status === 'connected' && isCorrectNetwork;
  const wasReady = useRef(ready);
  useEffect(() => {
    if (open && ready && !wasReady.current) close();
    wasReady.current = ready;
  }, [open, ready, close]);

  const controls = useMemo<ConnectDialogControls>(() => ({ open: show }), [show]);

  return (
    <ConnectDialogContext value={controls}>
      {children}
      <ConnectDialog open={open} onClose={close} />
    </ConnectDialogContext>
  );
}
