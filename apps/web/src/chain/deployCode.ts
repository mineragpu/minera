/**
 * The deploy code: the node key's EIP-191 signature over `RigRegistry.deployDigest(operator)`,
 * which is `keccak256(abi.encode("rig-deploy-v1", block.chainid, address(this), operator))`.
 * Recovering its signer here catches a code made for another node, wallet, registry or chain
 * before the visitor pays for a transaction that would revert.
 */

import type { Address, Hex } from '@minera/shared';
import { encodeAbiParameters, keccak256, recoverMessageAddress } from 'viem';

const DEPLOY_DOMAIN = 'rig-deploy-v1';

function deployDigest(chainId: number, registry: Address, operator: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }],
      [DEPLOY_DOMAIN, BigInt(chainId), registry, operator],
    ),
  );
}

/** The address that signed `code` for this operator, registry and chain, or null if it is not a signature. */
export async function deployCodeSigner(
  code: Hex,
  chainId: number,
  registry: Address,
  operator: Address,
): Promise<Address | null> {
  try {
    return await recoverMessageAddress({ message: { raw: deployDigest(chainId, registry, operator) }, signature: code });
  } catch {
    return null;
  }
}
