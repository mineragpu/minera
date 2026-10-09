import type { Deployment } from '@minera/shared';
import { burnPoolAbi, rigRegistryAbi } from './abi.ts';
import type { ChainClient } from './client.ts';

export type QuietReader = Pick<ChainClient, 'readContract'>;

/**
 * Whether the contracts have emitted none of the events the indexer follows, read from their
 * counters at the latest block: no rig deployed (so none changed or retired), nothing burned, no
 * settlement published (so none vetoed) and nothing claimed. When this holds, the history since the
 * deployment block holds nothing to index, so a first run can start at the head instead of asking
 * an endpoint for blocks it may no longer serve.
 */
export async function deploymentIsQuiet(client: QuietReader, deployment: Deployment): Promise<boolean> {
  const pool = { address: deployment.burnPool, abi: burnPoolAbi } as const;
  const [rigs, burned, settlements, claimed] = await Promise.all([
    client.readContract({ address: deployment.rigRegistry, abi: rigRegistryAbi, functionName: 'rigCount' }),
    client.readContract({ ...pool, functionName: 'totalBurned' }),
    client.readContract({ ...pool, functionName: 'settlementCount' }),
    client.readContract({ ...pool, functionName: 'totalClaimed' }),
  ]);
  return rigs === 0n && burned === 0n && settlements === 0n && claimed === 0n;
}
