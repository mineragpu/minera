import { keccak256, toBytes } from 'viem';
import type { Address, Hex } from '@minera/shared';

/**
 * Everything a settlement was computed from. Its digest is published on-chain with the root, and
 * the document itself is served in full, so anyone can redo the computation and compare.
 */
export interface SettlementInputs {
  version: 2;
  chainId: number;
  burnPool: Address;
  /** The settlement these entitlements build on; 0 before the first. */
  previousIndex: number;
  fromEpoch: number;
  toEpoch: number;
  epochSeconds: number;
  /** The pool block the budget was read at, and that block's timestamp. */
  poolBlock: string;
  poolTimestamp: string;
  /** New reward released by this settlement, in wei. */
  budget: string;
  /**
   * Per rig over the epoch range: the account it pays, its verified units, and the units paid for
   * after Sentinel's weighting (half on probation, nothing in a quarantined epoch). The split uses
   * the paid units.
   */
  work: { nodeKey: Address; account: Address; verified: string; units: string }[];
  /** This settlement's share per account, in wei. */
  allocation: { account: Address; amount: string }[];
  /** Cumulative entitlements per account, in wei: the leaves of the tree. */
  entitlements: { account: Address; cumulative: string }[];
}

export interface EncodedInputs {
  /** The exact bytes the digest covers: `JSON.stringify` of the inputs, UTF-8, no whitespace. */
  json: string;
  digest: Hex;
}

/** The epoch length a stored inputs document was computed with, if it records one. */
export function epochSecondsOf(json: string): number | null {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || !('epochSeconds' in parsed)) return null;
  return typeof parsed.epochSeconds === 'number' ? parsed.epochSeconds : null;
}

export function encodeInputs(inputs: SettlementInputs): EncodedInputs {
  const json = JSON.stringify(inputs);
  return { json, digest: keccak256(toBytes(json)) };
}
