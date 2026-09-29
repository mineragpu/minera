/**
 * The deploy code: the node key's authorization for one operator wallet to deploy this rig on one
 * registry and chain.
 *
 * It mirrors `RigRegistry.deployDigest(operator)`, which is
 * `keccak256(abi.encode("rig-deploy-v1", block.chainid, address(this), operator))`, signed as an
 * EIP-191 personal message over the 32 digest bytes, as `toEthSignedMessageHash(bytes32)` expects.
 */

import { CHAINS, deploymentFor, type Address, type Hex, type NetworkKey } from '@dayagpu/shared';
import { encodeAbiParameters, keccak256, type LocalAccount } from 'viem';

export interface DeployTarget {
  network: NetworkKey;
  chainId: number;
  registry: Address;
}

export type MessageSigner = Pick<LocalAccount, 'address' | 'signMessage'>;

const DEPLOY_DOMAIN = 'rig-deploy-v1';

/** The registry the deploy code is bound to, or null when the network has no deployment yet. */
export function deployTargetFor(network: NetworkKey): DeployTarget | null {
  const chainId = CHAINS[network].id;
  const deployment = deploymentFor(chainId);
  return deployment ? { network, chainId, registry: deployment.rigRegistry } : null;
}

export function deployDigest(chainId: number, registry: Address, operator: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }],
      [DEPLOY_DOMAIN, BigInt(chainId), registry, operator],
    ),
  );
}

export function createDeployCode(signer: MessageSigner, target: DeployTarget, operator: Address): Promise<Hex> {
  return signer.signMessage({ message: { raw: deployDigest(target.chainId, target.registry, operator) } });
}
