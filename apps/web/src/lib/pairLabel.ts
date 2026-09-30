import { findPair, type Address, type PairKind } from '@minera/shared';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { shortAddress } from '../wallet/format.ts';

interface PairLabel {
  /** The token's own symbol, or a short address for an asset this build does not list. */
  text: string;
  kind: PairKind;
}

export function pairLabel(pair: Address): PairLabel {
  const asset = findPair(ACTIVE_CHAIN.id, pair);
  return asset ? { text: asset.symbol, kind: asset.kind } : { text: shortAddress(pair), kind: 'stock' };
}
