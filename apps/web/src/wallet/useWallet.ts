import { createContext, useContext } from 'react';
import type { Address } from '@dayagpu/shared';
import type { WalletOption } from './discovery.ts';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletState {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  /** True when the connected wallet is on the network this build targets. */
  isCorrectNetwork: boolean;
  /** The connected wallet. */
  wallet: WalletOption | null;
  /** Every wallet found in this browser. */
  wallets: readonly WalletOption[];
  /** The wallet waiting on the visitor to approve a connection. */
  pendingId: string | null;
  /** The last problem, as a sentence to show. */
  error: string | null;
  connect(providerId: string): Promise<void>;
  disconnect(): Promise<void>;
  clearError(): void;
}

export const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (!state) throw new Error('useWallet() needs a <WalletProvider> above it');
  return state;
}
