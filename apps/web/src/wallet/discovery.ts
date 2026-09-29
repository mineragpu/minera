import { isEip1193Provider, isProviderDetail, type Eip1193Provider } from './eip1193.ts';

export interface WalletOption {
  /** Identifies the wallet for this page load: its announced uuid, or a fixed id for the fallback. */
  readonly id: string;
  /** The name the wallet announces for itself. */
  readonly name: string;
  /** An image data URI announced by the wallet, or empty when there is none to show. */
  readonly icon: string;
  /** Reverse-DNS id, stable across visits, used to reconnect without a prompt. */
  readonly rdns: string;
  readonly provider: Eip1193Provider;
}

/** The single injected provider, offered when no wallet announces itself. */
export const BROWSER_WALLET_ID = 'browser-wallet';

const ANNOUNCE = 'eip6963:announceProvider';
const REQUEST = 'eip6963:requestProvider';

const announced = new Map<string, WalletOption>();
const listeners = new Set<() => void>();
let snapshot: readonly WalletOption[] = [];
let listening = false;

/** Only raster or SVG data URIs, shown through <img>, so an icon can never run script. */
function safeIcon(icon: string): string {
  return /^data:image\/(?:svg\+xml|png|jpeg|webp|gif)[;,]/i.test(icon) ? icon : '';
}

function currentWallets(): WalletOption[] {
  const wallets = [...announced.values()];
  if (wallets.length > 0) return wallets;
  const injected = window.ethereum;
  if (!isEip1193Provider(injected)) return [];
  return [{ id: BROWSER_WALLET_ID, name: 'Browser wallet', icon: '', rdns: BROWSER_WALLET_ID, provider: injected }];
}

function unchanged(next: readonly WalletOption[]): boolean {
  return (
    next.length === snapshot.length &&
    next.every((wallet, index) => {
      const previous = snapshot[index];
      return previous !== undefined && previous.id === wallet.id && previous.provider === wallet.provider;
    })
  );
}

function publish(): void {
  const next = currentWallets();
  if (unchanged(next)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function onAnnounce(event: Event): void {
  if (!(event instanceof CustomEvent)) return;
  const detail: unknown = event.detail;
  if (!isProviderDetail(detail)) return;
  const { uuid, name, icon, rdns } = detail.info;
  announced.set(uuid, { id: uuid, name, icon: safeIcon(icon), rdns, provider: detail.provider });
  publish();
}

/** Asks every installed wallet to announce itself. Safe to repeat, for example when the dialog opens. */
export function requestWallets(): void {
  if (!listening) {
    listening = true;
    window.addEventListener(ANNOUNCE, onAnnounce);
  }
  window.dispatchEvent(new Event(REQUEST));
  publish();
}

export function subscribeWallets(listener: () => void): () => void {
  listeners.add(listener);
  requestWallets();
  return () => {
    listeners.delete(listener);
  };
}

export function getWallets(): readonly WalletOption[] {
  return snapshot;
}
