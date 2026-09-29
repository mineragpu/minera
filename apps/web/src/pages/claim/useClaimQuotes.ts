import { useEffect, useRef, useState } from 'react';
import type { Address, PairAsset } from '@dayagpu/shared';
import { quoteClaim, type Quote } from '../../chain/quote.ts';
import { DEPLOYMENT, PAIR_LISTING } from '../../config/contracts.ts';
import type { Eip1193Provider } from '../../wallet/eip1193.ts';

export type QuoteState = { status: 'loading' } | { status: 'ready'; quote: Quote } | { status: 'failed' };

interface QuoteSet {
  key: string;
  quotes: ReadonlyMap<Address, QuoteState>;
}

/**
 * A quote for swapping `amount` wei into each of `assets`, read through the wallet. Nothing is
 * quoted without a provider or with nothing to claim.
 */
export function useClaimQuotes(
  provider: Eip1193Provider | null,
  amount: bigint,
  assets: readonly PairAsset[],
): ReadonlyMap<Address, QuoteState> {
  const [set, setSet] = useState<QuoteSet | null>(null);
  const assetsRef = useRef(assets);
  useEffect(() => {
    assetsRef.current = assets;
  });
  const quoter = PAIR_LISTING.quoter;
  const pairZap = DEPLOYMENT?.pairZap ?? null;
  const addresses = assets.map((asset) => asset.address).join(',');
  const key = provider && quoter && pairZap && amount > 0n && addresses ? `${amount}:${addresses}` : null;

  useEffect(() => {
    if (!key || !provider || !quoter || !pairZap) return;
    let live = true;
    void Promise.all(
      assetsRef.current.map(async (asset): Promise<[Address, QuoteState]> => {
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

  if (!key) return new Map(assets.map((asset) => [asset.address, { status: 'failed' }]));
  if (set?.key !== key) return new Map(assets.map((asset) => [asset.address, { status: 'loading' }]));
  return set.quotes;
}
