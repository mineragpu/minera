/**
 * The Burn Pool's release limit, mirrored from the contract.
 *
 * The coordinator uses it to size each block's budget, so it never builds a settlement the
 * contract would reject. Integer arithmetic matches Solidity exactly: multiply first, divide last,
 * truncate toward zero.
 */

export const BPS = 10_000n;
export const DAY_SECONDS = 86_400n;

export interface PoolState {
  /** Everything ever deposited, in wei. */
  totalBurned: bigint;
  /** The total committed by the current head settlement, in wei. */
  committed: bigint;
  /** Unix time the head settlement was published, or the pool's deployment time if none. */
  since: bigint;
  /** Share of the uncommitted balance that may be committed per day, in basis points. */
  releaseBpsPerDay: bigint;
}

/** The largest total a settlement published at `now` could commit. */
export function releasable(state: PoolState, now: bigint): bigint {
  const uncommitted = state.totalBurned - state.committed;
  const elapsed = now > state.since ? now - state.since : 0n;
  const grow = (uncommitted * state.releaseBpsPerDay * elapsed) / (BPS * DAY_SECONDS);
  return state.committed + (grow > uncommitted ? uncommitted : grow);
}

/** How much new reward a settlement published at `now` can add on top of what is committed. */
export function blockBudget(state: PoolState, now: bigint): bigint {
  return releasable(state, now) - state.committed;
}
