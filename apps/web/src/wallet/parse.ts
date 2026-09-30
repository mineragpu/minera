import type { Address } from '@minera/shared';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY = /^0x[0-9a-fA-F]+$/;

/** The accounts a wallet returned, keeping only well-formed addresses. */
export function parseAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) return [];
  const items: readonly unknown[] = value;
  return items.filter((item): item is Address => typeof item === 'string' && ADDRESS.test(item));
}

/** A chain id from `eth_chainId` or `chainChanged`: a hex quantity, or a number from older wallets. */
export function parseChainId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && HEX_QUANTITY.test(value)) return Number.parseInt(value, 16);
  return null;
}
