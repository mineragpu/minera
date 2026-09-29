import { ETH_PAIR, type Address, type PairAsset, type PairListing } from '@dayagpu/shared';
import type { RigSummary } from '../../api/schemas.ts';

export interface ClaimPlan {
  /** No rigs, one pair shared by every rig, or rigs paired with different assets. */
  basis: 'no-rigs' | 'one-pair' | 'mixed-pairs';
  /** The rig with the most lifetime verified units; its pair is the default. Null without rigs. */
  leader: RigSummary | null;
  /** The asset chosen before the visitor picks: the leader's pair when this build lists it, else ETH. */
  preselected: Address;
  /** The listed stock tokens the wallet's rigs pair with, the preselected one first. */
  stocks: readonly PairAsset[];
}

export function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function listedAsset(listing: PairListing, pair: Address): PairAsset | undefined {
  return listing.assets.find((asset) => sameAddress(asset.address, pair));
}

/**
 * What a claim defaults to for a wallet with these rigs. The pair is not enforced by the contracts:
 * it only decides the default, and ETH stays available whatever the pair.
 */
export function claimPlan(rigs: readonly RigSummary[], listing: PairListing): ClaimPlan {
  const [first] = rigs;
  if (!first) return { basis: 'no-rigs', leader: null, preselected: ETH_PAIR, stocks: [] };

  const leader = rigs.reduce(
    (best, rig) => (rig.verifiedUnits.lifetime > best.verifiedUnits.lifetime ? rig : best),
    first,
  );
  const pairs = [leader.pair, ...rigs.map((rig) => rig.pair)].filter(
    (pair, index, all) => all.findIndex((other) => sameAddress(other, pair)) === index,
  );
  const stocks = pairs.flatMap((pair) => {
    const asset = listedAsset(listing, pair);
    return asset?.kind === 'stock' ? [asset] : [];
  });
  return {
    basis: pairs.length === 1 ? 'one-pair' : 'mixed-pairs',
    leader,
    preselected: listedAsset(listing, leader.pair)?.address ?? ETH_PAIR,
    stocks,
  };
}
