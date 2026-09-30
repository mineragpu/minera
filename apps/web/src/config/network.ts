import { CHAINS, DEFAULT_NETWORK, isNetworkKey, type ChainConfig } from '@minera/shared';

const requested: unknown = import.meta.env.VITE_NETWORK;

/** The network this build targets, fixed at build time by VITE_NETWORK. */
export const ACTIVE_CHAIN: ChainConfig = CHAINS[isNetworkKey(requested) ? requested : DEFAULT_NETWORK];

/** A short label for the network badge; the full chain name appears where a user connects. */
export const ACTIVE_NETWORK_LABEL = ACTIVE_CHAIN.network === 'mainnet' ? 'Mainnet' : 'Testnet';
