const KEY = 'wallet.last-rdns';

/**
 * Storage can be unavailable (private windows, blocked site data). Remembering the wallet only
 * saves a click on the next visit, so a failure is ignored.
 */
function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

/** The reverse-DNS id of the wallet used last, if any. */
export function readLastWallet(): string | null {
  return attempt(() => window.localStorage.getItem(KEY), null);
}

export function rememberWallet(rdns: string): void {
  attempt(() => window.localStorage.setItem(KEY, rdns), undefined);
}

export function forgetWallet(): void {
  attempt(() => window.localStorage.removeItem(KEY), undefined);
}
