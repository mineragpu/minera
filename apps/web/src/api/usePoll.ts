import { useCallback, useEffect, useRef, useState } from 'react';
import { API_MESSAGES, ApiError } from './errors.ts';

const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;

interface PollOptions<T> {
  /** Identifies what is loaded; a new key drops the old data and starts over. */
  key: string;
  intervalMs: number;
  /** Nothing is fetched while this is false. */
  enabled?: boolean;
  /** Stops polling once the data has reached a final state. */
  isFinal?: (data: T) => boolean;
}

export interface Polled<T> {
  /** `ready` once data has arrived; later failed refreshes keep the last data. */
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  error: ApiError | null;
  /** Fetches again now, showing the loading state if there is no data yet. */
  retry: () => void;
}

interface Snapshot<T> {
  key: string;
  data: T | null;
  error: ApiError | null;
}

function asApiError(cause: unknown): ApiError {
  return cause instanceof ApiError ? cause : new ApiError(API_MESSAGES.server, { status: null, code: 'unknown' });
}

/** The wait after `failures` failed attempts in a row: doubling, capped, never shorter than asked. */
function backoff(failures: number, error: ApiError): number {
  const doubled = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** (failures - 1));
  return Math.max(doubled, (error.retryAfterSeconds ?? 0) * 1000);
}

/**
 * Loads data now and again every `intervalMs`, backing off after failures. Polling pauses while
 * the tab is hidden and resumes when it is shown again.
 */
export function usePoll<T>(load: (signal: AbortSignal) => Promise<T>, options: PollOptions<T>): Polled<T> {
  const { key, intervalMs, enabled = true, isFinal } = options;
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  const isFinalRef = useRef(isFinal);
  useEffect(() => {
    loadRef.current = load;
    isFinalRef.current = isFinal;
  });

  if (snapshot.key !== key) setSnapshot({ key, data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer = 0;
    let failures = 0;
    let waitingForTab = false;

    const run = async () => {
      try {
        const data = await loadRef.current(controller.signal);
        if (controller.signal.aborted) return;
        failures = 0;
        setSnapshot({ key, data, error: null });
        if (!isFinalRef.current?.(data)) timer = window.setTimeout(tick, intervalMs);
      } catch (cause) {
        if (controller.signal.aborted) return;
        failures += 1;
        const error = asApiError(cause);
        setSnapshot((current) => ({ key, data: current.key === key ? current.data : null, error }));
        timer = window.setTimeout(tick, backoff(failures, error));
      }
    };

    const tick = () => {
      if (document.hidden) waitingForTab = true;
      else void run();
    };

    const onVisibility = () => {
      if (document.hidden || !waitingForTab) return;
      waitingForTab = false;
      void run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key, intervalMs, enabled, attempt]);

  const retry = useCallback(() => {
    setSnapshot((current) => ({ ...current, error: null }));
    setAttempt((count) => count + 1);
  }, []);

  const current = snapshot.key === key ? snapshot : { key, data: null, error: null };
  const status = current.data !== null ? 'ready' : current.error ? 'error' : 'loading';
  return { status, data: current.data, error: current.error, retry };
}
