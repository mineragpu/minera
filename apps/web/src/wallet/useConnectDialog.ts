import { createContext, useContext } from 'react';

export interface ConnectDialogControls {
  /** Opens the wallet dialog; focus returns to `trigger` when it closes. */
  open(trigger: HTMLElement | null): void;
}

export const ConnectDialogContext = createContext<ConnectDialogControls | null>(null);

export function useConnectDialog(): ConnectDialogControls {
  const controls = useContext(ConnectDialogContext);
  if (!controls) throw new Error('useConnectDialog() needs a <ConnectDialogProvider> above it');
  return controls;
}
