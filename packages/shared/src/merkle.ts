/**
 * Settlement trees in the exact format the Burn Pool verifies: leaves are
 * `keccak256(bytes.concat(keccak256(abi.encode(account, cumulative))))`, with sorted pairs.
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Address } from './rewards.ts';

const LEAF_ENCODING = ['address', 'uint256'];

export interface Settlement {
  root: `0x${string}`;
  total: bigint;
  proofs: Map<Address, { cumulative: bigint; proof: `0x${string}`[] }>;
  /** The full tree, serializable for publication so anyone can recompute the root. */
  dump: ReturnType<StandardMerkleTree<[string, string]>['dump']>;
}

export function buildSettlement(entitlements: ReadonlyMap<Address, bigint>): Settlement {
  const values: [string, string][] = [...entitlements]
    .filter(([, amount]) => amount > 0n)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([account, amount]) => [account, amount.toString()]);
  if (values.length === 0) throw new RangeError('a settlement needs at least one entitlement');

  const tree = StandardMerkleTree.of(values, LEAF_ENCODING);
  const proofs = new Map<Address, { cumulative: bigint; proof: `0x${string}`[] }>();
  let total = 0n;
  for (const [index, [account, amount]] of tree.entries()) {
    const cumulative = BigInt(amount);
    total += cumulative;
    proofs.set(account.toLowerCase() as Address, {
      cumulative,
      proof: tree.getProof(index) as `0x${string}`[],
    });
  }
  return { root: tree.root as `0x${string}`, total, proofs, dump: tree.dump() };
}
