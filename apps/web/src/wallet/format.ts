import type { Address } from '@dayagpu/shared';

/** `0x1234…abcd`: enough to recognise an address at a glance. */
export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
