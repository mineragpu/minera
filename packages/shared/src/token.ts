/**
 * The project token. Its address stays null until the token is deployed. Once it is set here, the
 * site publishes it in the FAQ and the footer, so there is one place to check an address against.
 */

import { BRAND } from './brand.ts';

export interface TokenInfo {
  /** The ticker, without the dollar sign. */
  symbol: string;
  /** The contract address exactly as it is on chain, or null before the token is deployed. */
  address: string | null;
  /** A page where the token can be viewed and traded, or null. */
  marketUrl: string | null;
  /** The address on a block explorer, or null. */
  explorerUrl: string | null;
}

export const TOKEN: TokenInfo = {
  symbol: BRAND.symbol,
  address: null,
  marketUrl: null,
  explorerUrl: null,
};
