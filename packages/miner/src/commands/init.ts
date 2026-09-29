/**
 * `rig init`: create the node key and print the deploy code for the operator's wallet.
 */

import type { Command } from '../args.ts';
import { deployTargetFor } from '../deploy-code.ts';
import { KeyExistsError, createNodeKey, type NodeKey } from '../keystore.ts';
import { readSettings, writeSettings } from '../settings.ts';
import { notDeployed, printDeployCode } from './code.ts';
import { EXIT, type CommandContext, type ExitCode } from './context.ts';

export async function initCommand(
  command: Extract<Command, { name: 'init' }>,
  context: CommandContext,
): Promise<ExitCode> {
  const { logger, paths } = context;
  const settings = readSettings(paths.settings);
  const network = command.network ?? settings.network;
  const target = deployTargetFor(network);
  if (target === null) return notDeployed(logger, network);

  let key: NodeKey;
  try {
    key = createNodeKey(paths.key, { force: command.force });
  } catch (error) {
    if (!(error instanceof KeyExistsError)) throw error;
    logger.error(
      `A node key already exists at ${paths.key}. Run rig code --operator <wallet> to print its deploy code, ` +
        'or add --force to replace it. A replaced key cannot run a rig deployed with the old one.',
    );
    return EXIT.failure;
  }
  writeSettings(paths.settings, { ...settings, network });

  const verb = command.force ? 'Replaced the node key' : 'Created a node key';
  logger.result(`${verb} at ${paths.key}. Keep this file private and back it up; it is this rig's identity.`, {
    keyPath: paths.key,
  });
  await printDeployCode(logger, key, target, command.operator);
  return EXIT.ok;
}
