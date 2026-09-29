/**
 * `rig status`: what this machine would bring to the network, without contacting the coordinator.
 */

import type { Command } from '../args.ts';
import { deployTargetFor } from '../deploy-code.ts';
import { describeGpu } from '../gpu.ts';
import { isKeyFileShared, loadNodeKey } from '../keystore.ts';
import { detectRuntime } from '../runtime.ts';
import { readSettings } from '../settings.ts';
import { EXIT, type CommandContext, type ExitCode } from './context.ts';

export async function statusCommand(
  command: Extract<Command, { name: 'status' }>,
  context: CommandContext,
): Promise<ExitCode> {
  const { logger, paths } = context;
  const settings = readSettings(paths.settings);
  const network = command.network ?? settings.network;

  const key = loadNodeKey(paths.key);
  if (key === null) {
    logger.result('Node key: none yet. Run rig init --operator <wallet> to create one.', { nodeAddress: null });
  } else {
    logger.result(`Node address: ${key.address}`, { nodeAddress: key.address });
    if (isKeyFileShared(paths.key, context.platform)) {
      logger.warn(`Other users can read the node key. Run chmod 600 ${paths.key} to fix it.`);
    }
  }

  const target = deployTargetFor(network);
  const registry = target === null ? 'registry not deployed yet' : `registry ${target.registry}`;
  logger.result(`Network: ${network}, ${registry}`, { network, registry: target?.registry ?? null });
  logger.result(`Config directory: ${paths.directory}`, { configDirectory: paths.directory });

  const [gpu, runtime] = await Promise.all([context.detectGpu(), detectRuntime(command.runtimeUrl)]);
  logger.result(gpu === null ? 'GPU: none detected' : `GPU: ${describeGpu(gpu)}`, {
    gpuModel: gpu?.model ?? null,
    vramMb: gpu?.vramMb ?? null,
    driver: gpu?.driver ?? null,
  });
  if (runtime === null) {
    logger.result(`Runtime: none answering at ${command.runtimeUrl}`, {
      runtimeUrl: command.runtimeUrl,
      runtimeVersion: null,
    });
  } else {
    const version = runtime.version ? ` version ${runtime.version}` : '';
    logger.result(`Runtime:${version} at ${command.runtimeUrl}`, {
      runtimeUrl: command.runtimeUrl,
      runtimeVersion: runtime.version ?? null,
    });
    const models = runtime.models.length > 0 ? runtime.models.join(', ') : 'none installed';
    logger.result(`Models: ${models}`, { models: runtime.models });
  }

  const coordinator = settings.coordinators[network];
  logger.result(
    coordinator ? `Coordinator: ${coordinator}` : 'Coordinator: not set. Pass --coordinator to rig start once.',
    { coordinator: coordinator ?? null },
  );
  return EXIT.ok;
}
