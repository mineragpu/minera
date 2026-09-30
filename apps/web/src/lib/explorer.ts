import type { Address, Hex } from '@minera/shared';
import { ACTIVE_CHAIN } from '../config/network.ts';

export function txUrl(hash: Hex): string {
  return `${ACTIVE_CHAIN.explorerUrl}/tx/${hash}`;
}

export function addressUrl(address: Address): string {
  return `${ACTIVE_CHAIN.explorerUrl}/address/${address}`;
}
