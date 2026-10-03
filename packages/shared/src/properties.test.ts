import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import fc from 'fast-check';
import { buildSettlement } from './merkle.ts';
import { BPS, blockBudget, releasable } from './release.ts';
import { accumulate, allocate, totalOf, type Address } from './rewards.ts';

const address = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => `0x${Buffer.from(bytes).toString('hex')}` as Address);
const wei = fc.bigInt({ min: 0n, max: 10n ** 27n });
const units = fc.bigInt({ min: 0n, max: 10n ** 12n });
const work = fc.array(fc.record({ account: address, units }), { maxLength: 30 });
const entitlements = fc
  .array(fc.tuple(address, fc.bigInt({ min: 1n, max: 10n ** 27n })), { minLength: 1, maxLength: 20 })
  .map((entries) => new Map(entries.map(([account, amount]) => [account.toLowerCase() as Address, amount])));

describe('reward properties', () => {
  it('never allocates more than the budget, and loses less than one wei per account', () => {
    fc.assert(
      fc.property(wei, work, (budget, records) => {
        const allocation = allocate(budget, records);
        const total = totalOf(allocation);
        assert.ok(total <= budget);
        const working = records.filter((record) => record.units > 0n);
        const paid = new Set(working.map((record) => record.account.toLowerCase()));
        if (paid.size > 0 && budget > 0n) assert.ok(budget - total < BigInt(paid.size));
        for (const amount of allocation.values()) assert.ok(amount > 0n);
      }),
    );
  });

  it('pays more work at least as much as less work', () => {
    fc.assert(
      fc.property(wei, address, address, units, units, (budget, a, b, x, y) => {
        fc.pre(a.toLowerCase() !== b.toLowerCase());
        const allocation = allocate(budget, [
          { account: a, units: x },
          { account: b, units: y },
        ]);
        const share = (account: Address) => allocation.get(account.toLowerCase() as Address) ?? 0n;
        if (x >= y) assert.ok(share(a) >= share(b));
        else assert.ok(share(a) <= share(b));
      }),
    );
  });

  it('accumulates without losing or shrinking anyone', () => {
    fc.assert(
      fc.property(entitlements, entitlements, (cumulative, allocation) => {
        const next = accumulate(cumulative, allocation);
        assert.equal(totalOf(next), totalOf(cumulative) + totalOf(allocation));
        for (const [account, amount] of cumulative) assert.ok((next.get(account) ?? 0n) >= amount);
      }),
    );
  });
});

describe('release limit properties', () => {
  const state = fc
    .record({
      totalBurned: wei,
      committedShare: fc.integer({ min: 0, max: 10_000 }),
      since: fc.bigInt({ min: 1_700_000_000n, max: 1_900_000_000n }),
      releaseBpsPerDay: fc.bigInt({ min: 0n, max: BPS }),
    })
    .map(({ totalBurned, committedShare, since, releaseBpsPerDay }) => ({
      totalBurned,
      committed: (totalBurned * BigInt(committedShare)) / 10_000n,
      since,
      releaseBpsPerDay,
    }));
  const elapsed = fc.bigInt({ min: 0n, max: 10n ** 9n });

  it('stays between what is committed and what was burned, and only grows with time', () => {
    fc.assert(
      fc.property(state, elapsed, elapsed, (pool, d1, d2) => {
        const earlier = releasable(pool, pool.since + (d1 < d2 ? d1 : d2));
        const later = releasable(pool, pool.since + (d1 < d2 ? d2 : d1));
        assert.ok(pool.committed <= earlier && earlier <= later && later <= pool.totalBurned);
        assert.ok(blockBudget(pool, pool.since + d1) >= 0n);
      }),
    );
  });
});

describe('settlement tree properties', () => {
  it('proves every entitlement against the root, and totals them exactly', () => {
    fc.assert(
      fc.property(entitlements, (cumulative) => {
        const settlement = buildSettlement(cumulative);
        assert.equal(settlement.total, totalOf(cumulative));
        assert.equal(settlement.proofs.size, cumulative.size);
        for (const [account, { cumulative: amount, proof }] of settlement.proofs) {
          assert.equal(amount, cumulative.get(account));
          const leaf: [string, string] = [account, amount.toString()];
          assert.ok(StandardMerkleTree.verify(settlement.root, ['address', 'uint256'], leaf, proof));
        }
      }),
      { numRuns: 50 },
    );
  });

  it('builds the same root whatever order the entitlements arrive in', () => {
    fc.assert(
      fc.property(entitlements, (cumulative) => {
        const reversed = new Map([...cumulative].reverse());
        assert.equal(buildSettlement(reversed).root, buildSettlement(cumulative).root);
      }),
      { numRuns: 50 },
    );
  });
});
