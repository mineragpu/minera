import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { accumulate, allocate, totalOf, type Address } from './rewards.ts';

const alice = '0x00000000000000000000000000000000000a11ce' as Address;
const bob = '0x0000000000000000000000000000000000000b0b' as Address;

describe('allocate', () => {
  it('splits the budget in proportion to verified work', () => {
    const allocation = allocate(1_000n, [
      { account: alice, units: 3n },
      { account: bob, units: 1n },
    ]);
    assert.equal(allocation.get(alice), 750n);
    assert.equal(allocation.get(bob), 250n);
  });

  it('never allocates more than the budget', () => {
    const allocation = allocate(100n, [
      { account: alice, units: 1n },
      { account: bob, units: 2n },
    ]);
    assert.ok(totalOf(allocation) <= 100n);
    assert.equal(allocation.get(alice), 33n);
    assert.equal(allocation.get(bob), 66n);
  });

  it('merges records for the same account regardless of address case', () => {
    const allocation = allocate(900n, [
      { account: alice, units: 1n },
      { account: alice.toUpperCase().replace('0X', '0x') as Address, units: 2n },
      { account: bob, units: 6n },
    ]);
    assert.equal(allocation.get(alice), 300n);
    assert.equal(allocation.get(bob), 600n);
  });

  it('allocates nothing without work or without budget', () => {
    assert.equal(allocate(1_000n, []).size, 0);
    assert.equal(allocate(0n, [{ account: alice, units: 5n }]).size, 0);
  });

  it('rejects negative work', () => {
    assert.throws(() => allocate(1n, [{ account: alice, units: -1n }]), RangeError);
  });
});

describe('accumulate', () => {
  it('adds a block to cumulative entitlements without mutating the input', () => {
    const before = new Map([[alice, 10n]]);
    const after = accumulate(before, new Map([[alice, 5n], [bob, 7n]]));
    assert.equal(after.get(alice), 15n);
    assert.equal(after.get(bob), 7n);
    assert.equal(before.get(alice), 10n);
  });
});
