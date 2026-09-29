/**
 * Waiting between attempts: exponential backoff with jitter, and a sleep that ends early when the
 * node is asked to stop.
 */

export interface Backoff {
  /** The delay before the next attempt, in milliseconds. Each call doubles the ceiling. */
  next(): number;
  reset(): void;
}

export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  random?: () => number;
}

export const BACKOFF_CAP_MS = 60_000;

/**
 * Each delay falls between half and all of the current ceiling, so many nodes that lost the
 * coordinator at once do not return in step.
 */
export function createBackoff(options: BackoffOptions = {}): Backoff {
  const baseMs = options.baseMs ?? 1_000;
  const capMs = options.capMs ?? BACKOFF_CAP_MS;
  const random = options.random ?? Math.random;
  let attempt = 0;
  return {
    next() {
      const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
      attempt = Math.min(attempt + 1, 30);
      return Math.round(ceiling / 2 + random() * (ceiling / 2));
    },
    reset() {
      attempt = 0;
    },
  };
}

/** Resolves after `ms`, or as soon as `signal` aborts. Never rejects. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}
