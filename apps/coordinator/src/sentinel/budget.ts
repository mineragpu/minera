const MINUTE_MS = 60_000;
/** Past this many tracked keys, windows from earlier minutes are dropped. */
const PRUNE_AT = 10_000;

export interface RequestBudget {
  /** Count a request; `false` once the key has spent its budget for the current minute. */
  take(key: string, now: Date): boolean;
}

/**
 * Signed requests per node key, counted in fixed one-minute windows in this process. The per
 * address limit stops unsigned floods; this one stops a valid key from flooding on its own.
 */
export function requestBudget(perMinute: number): RequestBudget {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now) {
      const start = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
      const window = windows.get(key);
      if (window && window.start === start) {
        window.count += 1;
        return window.count <= perMinute;
      }
      if (windows.size >= PRUNE_AT) {
        for (const [tracked, { start: from }] of windows) if (from !== start) windows.delete(tracked);
      }
      windows.set(key, { start, count: 1 });
      return perMinute > 0;
    },
  };
}
