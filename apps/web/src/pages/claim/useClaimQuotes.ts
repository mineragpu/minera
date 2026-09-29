import { useEffect, useState } from 'react';
import type { Address, PairAsset } from '@dayagpu/shared';
import { quoteClaim, type Quote } from '../../chain/quote.ts';
import { DEPLOYMENT, PAIR_LISTING } from '../../config/contracts.ts';
import type { Eip1193Provider } from '../../wallet/eip1193.ts';

export type QuoteState = { status: 'loading' } | { status: 'ready'; quote: Quote } | { status: 'failed' };

interface QuoteSet {
  key: string;
  quotes: ReadonlyMap<Address, QuoteState>;
}

export const STOCK_PAIRS: readonly PairAsset[] = PAIR_LISTING.assets.filter((asset) => asset.kind === 'stock');

/**
 * A quote for swapping `amount` wei into each listed stock token, read through the wallet. Nothing
 * is quoted without a provider or with nothing to claim.
 */
export function useClaimQuotes(provider: Eip1193Provider | null, amount: bigint): ReadonlyMap<Address, QuoteState> {
  const [set, setSet] = useState<QuoteSet | null>(null);
  const quoter = PAIR_LISTING.quoter;
  const pairZap = DEPLOYMENT?.pairZap ?? null;
  const key = provider && quoter && pairZap && amount > 0n ? `${amount}` : null;

  useEffect(() => {
    if (!key || !provider || !quoter || !pairZap) return;
    let live = true;
    void Promise.all(
      STOCK_PAIRS.map(async (asset): Promise<[Address, QuoteState]> => {
        try {
          return [asset.address, { status: 'ready', quote: await quoteClaim(provider, { pairZap, quoter }, asset.address, amount) }];
        } catch {
          return [asset.address, { status: 'failed' }];
        }
      }),
    ).then((entries) => {
      if (live) setSet({ key, quotes: new Map(entries) });
    });
    return () => {
      live = false;
    };
  }, [key, provider, quoter, pairZap, amount]);

  if (!key) return new Map(STOCK_PAIRS.map((asset) => [asset.address, { status: 'failed' }]));
  if (set?.key !== key) return new Map(STOCK_PAIRS.map((asset) => [asset.address, { status: 'loading' }]));
  return set.quotes;
}
