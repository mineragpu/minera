import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { blockBudget, releasable, type PoolState } from './release.ts';

const ETH = 10n ** 18n;

function pool(overrides: Partial<PoolState> = {}): PoolState {
  return { totalBurned: 100n * ETH, committed: 0n, since: 1_000n, releaseBpsPerDay: 200n, ...overrides };
}

describe('releasable', () => {
  it('releases nothing at the moment of the last settlement', () => {
    assert.equal(releasable(pool(), 1_000n), 0n);
  });

  it('releases the configured daily share after one day', () => {
    assert.equal(releasable(pool(), 1_000n + 86_400n), 2n * ETH);
  });

  it('never releases more than was burned', () => {
    assert.equal(releasable(pool(), 1_000n + 86_400n * 10_000n), 100n * ETH);
  });

  it('grows from the committed total, on the uncommitted balance only', () => {
    const state = pool({ committed: 50n * ETH });
    assert.equal(releasable(state, 1_000n + 86_400n), 51n * ETH);
    assert.equal(blockBudget(state, 1_000n + 86_400n), 1n * ETH);
  });

  it('truncates like Solidity integer division', () => {
    const state = pool({ totalBurned: 999n, releaseBpsPerDay: 1n });
    assert.equal(releasable(state, 1_000n + 86_400n), 0n);
  });
});
