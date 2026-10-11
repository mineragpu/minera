/**
 * The size of the indexer's next log request.
 *
 * A refused request halves it, down to the smallest range public endpoints serve, so an indexer
 * that fell behind a free endpoint's recent window catches up through the next one. After a run of
 * accepted requests it doubles again, up to the configured size, so one refusal does not slow the
 * rest of a long catch-up. Once the indexer has caught up, it returns to the configured size.
 */

export interface LogRangeLimits {
  /** The smallest range; a refusal at this size is an error. */
  min: bigint;
  /** The configured range. */
  max: bigint;
  /** Accepted requests in a row before the range doubles. */
  regrowAfter: number;
}

export interface LogRange {
  size: bigint;
  /** Accepted requests in a row at the current size. */
  streak: number;
}

export function initialLogRange(limits: LogRangeLimits): LogRange {
  return { size: limits.max, streak: 0 };
}

/** The range after a refused request, or null when it is already at the smallest size. */
export function afterRefusal(range: LogRange, limits: LogRangeLimits): LogRange | null {
  if (range.size <= limits.min) return null;
  const half = range.size / 2n;
  return { size: half > limits.min ? half : limits.min, streak: 0 };
}

/** The range after an accepted request. */
export function afterSuccess(range: LogRange, limits: LogRangeLimits, caughtUp: boolean): LogRange {
  if (caughtUp || range.size >= limits.max) return { size: limits.max, streak: 0 };
  const streak = range.streak + 1;
  if (streak < limits.regrowAfter) return { size: range.size, streak };
  const double = range.size * 2n;
  return { size: double < limits.max ? double : limits.max, streak: 0 };
}
