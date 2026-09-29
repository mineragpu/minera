import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Address } from '@dayagpu/shared';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { getWallets, subscribeWallets, type WalletOption } from './discovery.ts';
import type { ProviderListener } from './eip1193.ts';
import { WALLET_MESSAGES, describeWalletError } from './errors.ts';
import { parseAccounts, parseChainId } from './parse.ts';
import { forgetWallet, readLastWallet, rememberWallet } from './storage.ts';
import { WalletContext, type WalletState } from './useWallet.ts';

interface Session {
  wallet: WalletOption;
  address: Address;
  chainId: number | null;
}

async function readChainId(wallet: WalletOption): Promise<number | null> {
  return parseChainId(await wallet.provider.request({ method: 'eth_chainId' }));
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useSyncExternalStore(subscribeWallets, getWallets, getWallets);
  const [session, setSession] = useState<Session | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletsRef = useRef(wallets);
  const sessionRef = useRef(session);
  const pendingRef = useRef<string | null>(null);
  const reconnectTried = useRef(false);
  useEffect(() => {
    walletsRef.current = wallets;
    sessionRef.current = session;
  });

  const endSession = useCallback(() => {
    setSession(null);
    forgetWallet();
  }, []);

  // A returning visitor's wallet is asked for its accounts without a prompt, once it announces.
  useEffect(() => {
    if (reconnectTried.current || session) return;
    const rdns = readLastWallet();
    if (!rdns) {
      reconnectTried.current = true;
      return;
    }
    const wallet = wallets.find((option) => option.rdns === rdns);
    if (!wallet) return;
    reconnectTried.current = true;
    void (async () => {
      try {
        const [address] = parseAccounts(await wallet.provider.request({ method: 'eth_accounts' }));
        if (!address) {
          forgetWallet();
          return;
        }
        const chainId = await readChainId(wallet);
        setSession((current) => current ?? { wallet, address, chainId });
      } catch {
        forgetWallet();
      }
    })();
  }, [wallets, session]);

  const activeWallet = session?.wallet;
  useEffect(() => {
    const provider = activeWallet?.provider;
    if (!provider?.on) return;
    const onAccounts: ProviderListener = (accounts) => {
      const [address] = parseAccounts(accounts);
      if (!address) endSession();
      else setSession((current) => current && { ...current, address });
    };
    const onChain: ProviderListener = (chainId) => {
      setSession((current) => current && { ...current, chainId: parseChainId(chainId) });
    };
    const onDisconnect: ProviderListener = () => endSession();
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    provider.on('disconnect', onDisconnect);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
      provider.removeListener?.('disconnect', onDisconnect);
    };
  }, [activeWallet, endSession]);

  const connect = useCallback(async (providerId: string) => {
    if (pendingRef.current) {
      setError(WALLET_MESSAGES.pending);
      return;
    }
    const wallet = walletsRef.current.find((option) => option.id === providerId);
    if (!wallet) {
      setError(WALLET_MESSAGES.noWallet);
      return;
    }
    pendingRef.current = providerId;
    setPendingId(providerId);
    setError(null);
    try {
      const [address] = parseAccounts(await wallet.provider.request({ method: 'eth_requestAccounts' }));
      if (!address) {
        setError(WALLET_MESSAGES.noAccount);
        return;
      }
      const chainId = await readChainId(wallet);
      setSession({ wallet, address, chainId });
      rememberWallet(wallet.rdns);
    } catch (cause) {
      setError(describeWalletError(cause));
    } finally {
      pendingRef.current = null;
      setPendingId(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const wallet = sessionRef.current?.wallet;
    endSession();
    setError(null);
    if (!wallet) return;
    // Revoking is optional in the standard; the site has already forgotten the wallet either way.
    await wallet.provider
      .request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
      .catch(() => undefined);
  }, [endSession]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<WalletState>(
    () => ({
      status: session ? 'connected' : pendingId ? 'connecting' : 'disconnected',
      address: session?.address ?? null,
      chainId: session?.chainId ?? null,
      isCorrectNetwork: session?.chainId === ACTIVE_CHAIN.id,
      wallet: session?.wallet ?? null,
      wallets,
      pendingId,
      error,
      connect,
      disconnect,
      clearError,
    }),
    [session, pendingId, error, wallets, connect, disconnect, clearError],
  );

  return <WalletContext value={value}>{children}</WalletContext>;
}
