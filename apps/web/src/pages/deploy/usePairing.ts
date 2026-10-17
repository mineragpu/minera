import { useEffect, useState } from 'react';
import { fetchPairing } from '../../api/coordinator.ts';
import { ApiError } from '../../api/errors.ts';
import type { PairingView } from '../../api/schemas.ts';

const POLL_MS = 3_000;
const SLOW_POLL_MS = 15_000;

export type Pairing =
  | { state: 'off' }
  | { state: 'waiting'; problem: boolean }
  | { state: 'paired'; machine: PairingView };

/**
 * Waits for a GPU machine to pair under `code`, asking the coordinator every few seconds while the
 * tab is visible. A 404 means no machine yet; other failures slow the asking down and say so.
 */
export function usePairing(code: string | null): Pairing {
  const [result, setResult] = useState<{ code: string; pairing: Pairing } | null>(null);

  useEffect(() => {
    if (code === null) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const ask = async (): Promise<void> => {
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(() => void ask(), POLL_MS);
        return;
      }
      controller = new AbortController();
      let next = POLL_MS;
      try {
        const machine = await fetchPairing(code, controller.signal);
        if (!live) return;
        setResult({ code, pairing: { state: 'paired', machine } });
        return;
      } catch (cause) {
        if (!live) return;
        const waiting = cause instanceof ApiError && cause.status === 404;
        if (!waiting) next = SLOW_POLL_MS;
        setResult({ code, pairing: { state: 'waiting', problem: !waiting } });
      }
      timer = setTimeout(() => void ask(), next);
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [code]);

  if (code === null) return { state: 'off' };
  return result?.code === code ? result.pairing : { state: 'waiting', problem: false };
}
