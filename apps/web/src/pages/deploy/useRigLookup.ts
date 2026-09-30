import { useEffect, useState } from 'react';
import type { Address } from '@minera/shared';
import { fetchRig } from '../../api/coordinator.ts';
import { ApiError } from '../../api/errors.ts';

/** `unknown` covers both not asked yet and a lookup that failed; the registry has the final word. */
export type RigLookup = 'unknown' | 'free' | 'deployed';

/** Asks the coordinator whether a node address is already on the board. */
export function useRigLookup(nodeAddress: Address | null): RigLookup {
  const [result, setResult] = useState<{ nodeAddress: Address; lookup: RigLookup } | null>(null);

  useEffect(() => {
    if (!nodeAddress) return;
    const controller = new AbortController();
    fetchRig(nodeAddress, controller.signal).then(
      () => setResult({ nodeAddress, lookup: 'deployed' }),
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        const free = cause instanceof ApiError && cause.status === 404;
        setResult({ nodeAddress, lookup: free ? 'free' : 'unknown' });
      },
    );
    return () => controller.abort();
  }, [nodeAddress]);

  return result && result.nodeAddress === nodeAddress ? result.lookup : 'unknown';
}
