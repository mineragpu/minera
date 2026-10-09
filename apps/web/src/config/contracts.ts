import { deploymentFor, pairListingFor, type Deployment, type PairListing } from '@minera/shared';
import { ACTIVE_CHAIN } from './network.ts';

/** The contracts on the network this build targets, or null before they are deployed there. */
export const DEPLOYMENT: Deployment | null = deploymentFor(ACTIVE_CHAIN.id) ?? null;

/** The assets a rig can pair with on this network, ETH first. */
export const PAIR_LISTING: PairListing = pairListingFor(ACTIVE_CHAIN.id);

/** Whether any stock token is listed here; without one, every claim pays in ETH. */
export const STOCKS_LISTED = PAIR_LISTING.assets.some((asset) => asset.kind === 'stock');
