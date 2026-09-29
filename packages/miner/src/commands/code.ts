/**
 * `rig code`: print the deploy code of the existing node key for an operator wallet and network.
 */

import { BRAND, type Address } from '@dayagpu/shared';
import type { Command } from '../args.ts';
import { createDeployCode, deployTargetFor, type DeployTarget } from '../deploy-code.ts';
import { loadNodeKey, type NodeKey } from '../keystore.ts';
import type { Logger } from '../logger.ts';
import { readSettings } from '../settings.ts';
import { EXIT, type CommandContext, type ExitCode } from './context.ts';

export async function printDeployCode(
  logger: Logger,
  key: NodeKey,
  target: DeployTarget,
  operator: Address,
): Promise<void> {
  const code = await createDeployCode(key.account, target, operator);
  logger.result(`Node address: ${key.address}`, { nodeAddress: key.address });
  logger.result(`Network: ${target.network}, registry ${target.registry}`, {
    network: target.network,
    chainId: target.chainId,
    registry: target.registry,
  });
  logger.result(`Deploy code: ${code}`, { deployCode: code, operator });
  logger.result(
    `Paste the deploy code into the Deploy page at ${BRAND.links.site} while connected with wallet ${operator}.`,
  );
}

export function notDeployed(logger: Logger, network: string): ExitCode {
  logger.error(`The rig registry is not deployed on ${network} yet, so there is nothing to deploy to.`);
  return EXIT.failure;
}

export async function codeCommand(
  command: Extract<Command, { name: 'code' }>,
  context: CommandContext,
): Promise<ExitCode> {
  const { logger, paths } = context;
  const key = loadNodeKey(paths.key);
  if (key === null) {
    logger.error(`No node key found at ${paths.key}. Run rig init --operator <wallet> first.`);
    return EXIT.failure;
  }
  const network = command.network ?? readSettings(paths.settings).network;
  const target = deployTargetFor(network);
  if (target === null) return notDeployed(logger, network);
  await printDeployCode(logger, key, target, command.operator);
  return EXIT.ok;
}
