/**
 * The assets a rig's rewards can pair with, per chain.
 *
 * ETH is address zero and always valid. Every other entry is a token the rig registry lists and
 * the pair zap routes to. Symbols are the tokens' own `symbol()` values, read from the chain: they
 * label assets in the app and never appear in marketing copy.
 */

import type { Address } from './rewards.ts';

export const ETH_PAIR: Address = '0x0000000000000000000000000000000000000000';

export type PairKind = 'native' | 'stock';

export interface PairAsset {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
  readonly kind: PairKind;
}

export interface PairListing {
  /** ETH first, then the listed stock tokens. */
  readonly assets: readonly PairAsset[];
  /** Prices a swap from ETH into a listed asset, so a claim can set its minimum output. */
  readonly quoter: Address | null;
}

const ETH: PairAsset = { address: ETH_PAIR, symbol: 'ETH', decimals: 18, kind: 'native' };

export const PAIR_LISTINGS: Readonly<Record<number, PairListing>> = {
  46630: {
    assets: [
      ETH,
      { address: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02', symbol: 'AMZN', decimals: 18, kind: 'stock' },
      { address: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E', symbol: 'TSLA', decimals: 18, kind: 'stock' },
    ],
    quoter: '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94',
  },
};

/** A chain with nothing listed yet still pairs with ETH. */
const ETH_ONLY: PairListing = { assets: [ETH], quoter: null };

export function pairListingFor(chainId: number): PairListing {
  return PAIR_LISTINGS[chainId] ?? ETH_ONLY;
}

/** The listed asset at `address` on `chainId`, matched without regard to case. */
export function findPair(chainId: number, address: string): PairAsset | undefined {
  const wanted = address.toLowerCase();
  return pairListingFor(chainId).assets.find((asset) => asset.address.toLowerCase() === wanted);
}
