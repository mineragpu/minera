import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { buildSettlement } from './merkle.ts';
import type { Address } from './rewards.ts';

const alice = '0x00000000000000000000000000000000000a11ce' as Address;
const bob = '0x0000000000000000000000000000000000000b0b' as Address;
const carol = '0x000000000000000000000000000000000000ca01' as Address;

describe('buildSettlement', () => {
  const settlement = buildSettlement(new Map([[alice, 750n], [bob, 250n], [carol, 1n]]));

  it('commits the sum of all entitlements', () => {
    assert.equal(settlement.total, 1_001n);
  });

  it('produces a proof that verifies for every account', () => {
    for (const [account, { cumulative, proof }] of settlement.proofs) {
      assert.ok(
        StandardMerkleTree.verify(settlement.root, ['address', 'uint256'], [account, cumulative.toString()], proof),
      );
    }
  });

  it('is independent of insertion order', () => {
    const reordered = buildSettlement(new Map([[carol, 1n], [bob, 250n], [alice, 750n]]));
    assert.equal(reordered.root, settlement.root);
  });

  it('leaves out zero entitlements and refuses an empty settlement', () => {
    assert.equal(buildSettlement(new Map([[alice, 5n], [bob, 0n]])).proofs.size, 1);
    assert.throws(() => buildSettlement(new Map([[alice, 0n]])), RangeError);
  });
});
