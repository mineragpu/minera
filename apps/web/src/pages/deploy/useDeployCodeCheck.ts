import { useEffect, useState } from 'react';
import type { Address, Hex } from '@minera/shared';
import { deployCodeSigner } from '../../chain/deployCode.ts';
import { DEPLOYMENT } from '../../config/contracts.ts';
import { ACTIVE_CHAIN } from '../../config/network.ts';

export type CodeCheck = 'waiting' | 'checking' | 'match' | 'mismatch';

interface Result {
  key: string;
  match: boolean;
}

/**
 * Whether `code` was signed by `nodeAddress` for `operator` on this registry and chain, checked in
 * the browser. `waiting` until all three are known.
 */
export function useDeployCodeCheck(nodeAddress: Address | null, code: Hex | null, operator: Address | null): CodeCheck {
  const [result, setResult] = useState<Result | null>(null);
  const registry = DEPLOYMENT?.rigRegistry ?? null;
  const key = nodeAddress && code && operator && registry ? `${nodeAddress}:${code}:${operator}` : null;

  useEffect(() => {
    if (!key || !nodeAddress || !code || !operator || !registry) return;
    let live = true;
    void deployCodeSigner(code, ACTIVE_CHAIN.id, registry, operator).then((signer) => {
      if (live) setResult({ key, match: signer?.toLowerCase() === nodeAddress.toLowerCase() });
    });
    return () => {
      live = false;
    };
  }, [key, nodeAddress, code, operator, registry]);

  if (!key) return 'waiting';
  if (result?.key !== key) return 'checking';
  return result.match ? 'match' : 'mismatch';
}
