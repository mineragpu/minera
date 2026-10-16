/**
 * The project token. Its address stays null until the token is deployed. Once it is set here, the
 * site publishes it in the FAQ and the footer, so there is one place to check an address against.
 */

import { BRAND } from './brand.ts';
import type { Address } from './rewards.ts';

/** How the token's supply is counted, published so anyone can redo the sums from the chain. */
export interface TokenSupplyRules {
  /** The chain the token lives on. */
  chainId: number;
  decimals: number;
  /** The most that can ever exist, in whole tokens: the contract has no mint function. */
  maxSupply: string;
  /** Addresses that hold burned tokens. Their balance is not part of the total supply. */
  burnAddresses: readonly Address[];
  /** Wallets whose balance is not circulating, each with what it holds tokens for. */
  nonCirculating: readonly { address: Address; label: string }[];
}

export interface TokenInfo {
  /** The ticker, without the dollar sign. */
  symbol: string;
  /** The contract address exactly as it is on chain, or null before the token is deployed. */
  address: string | null;
  /** A page where the token can be viewed and traded, or null. */
  marketUrl: string | null;
  /** The address on a block explorer, or null. */
  explorerUrl: string | null;
  /** The launch date, YYYY-MM-DD, or null before it launches. */
  launchedOn: string | null;
  /** How the supply is counted, or null before the token is deployed. */
  supply: TokenSupplyRules | null;
}

export const TOKEN: TokenInfo = {
  symbol: BRAND.symbol,
  address: '0x811e6953bcdee5277de0f194e6e2fb1018ce33b4',
  marketUrl: 'https://ponsfamily.com/launchpad/0x811e6953bcdee5277de0f194e6e2fb1018ce33b4',
  explorerUrl: 'https://robin.etherscan.io/token/0x811e6953bcdee5277de0f194e6e2fb1018ce33b4',
  launchedOn: '2026-10-08',
  supply: {
    chainId: 4663,
    decimals: 18,
    maxSupply: '1000000000',
    burnAddresses: ['0x000000000000000000000000000000000000dEaD'],
    nonCirculating: [
      { address: '0x912DDBBE43FdFbf39cEF17ee7EaE0b8f534f3B8b', label: 'Project wallet: development and user rewards' },
    ],
  },
};
