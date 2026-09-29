/**
 * The browser wallet standards the site talks to: the provider API (EIP-1193) and multi-wallet
 * discovery (EIP-6963). Everything a wallet hands us is untrusted, so each shape has a guard.
 */

export interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[];
}

export type ProviderListener = (...args: unknown[]) => void;

export interface Eip1193Provider {
  request(args: RequestArguments): Promise<unknown>;
  on?(event: string, listener: ProviderListener): unknown;
  removeListener?(event: string, listener: ProviderListener): unknown;
}

export interface Eip6963ProviderInfo {
  readonly uuid: string;
  readonly name: string;
  readonly icon: string;
  readonly rdns: string;
}

export interface Eip6963ProviderDetail {
  readonly info: Eip6963ProviderInfo;
  readonly provider: Eip1193Provider;
}

declare global {
  interface Window {
    /** A single injected provider, from wallets that predate EIP-6963. */
    ethereum?: unknown;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return isRecord(value) && typeof value.request === 'function';
}

export function isProviderDetail(value: unknown): value is Eip6963ProviderDetail {
  if (!isRecord(value) || !isRecord(value.info) || !isEip1193Provider(value.provider)) return false;
  const { uuid, name, icon, rdns } = value.info;
  return isFilledString(uuid) && isFilledString(name) && typeof icon === 'string' && isFilledString(rdns);
}
