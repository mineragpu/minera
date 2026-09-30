import type { Address } from '@minera/shared';
import { ACTIVE_CHAIN } from '../config/network.ts';

/**
 * The public record of a contract's source, matched exactly against its deployed bytecode. Every
 * deployment in the shared deployments list is verified there before it is listed.
 */
export function verifiedSourceUrl(address: Address): string {
  return `https://repo.sourcify.dev/contracts/full_match/${ACTIVE_CHAIN.id}/${address}/`;
}
