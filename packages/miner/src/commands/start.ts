/**
 * `rig start`: check the machine, connect to the coordinator and run jobs until stopped.
 */

import { BRAND } from '@dayagpu/shared';
import type { Command } from '../args.ts';
import { CoordinatorError, createCoordinatorClient } from '../client.ts';
import { describeGpu } from '../gpu.ts';
import { isKeyFileShared, loadNodeKey } from '../keystore.ts';
import { runNode } from '../loop.ts';
import { createJobRunner } from '../runner.ts';
import { detectRuntime } from '../runtime.ts';
import { readSettings, writeSettings } from '../settings.ts';
import { CLIENT_VERSION } from '../version.ts';
import { EXIT, type CommandContext, type ExitCode } from './context.ts';

function refusalHint(error: CoordinatorError): string {
  if (error.status === 401 || error.status === 403) {
    return ' Check that this rig is deployed: run rig code --operator <wallet> and paste the code on the Deploy page.';
  }
  if (error.status === 404) return ' Check the coordinator URL.';
  return '';
}

export async function startCommand(
  command: Extract<Command, { name: 'start' }>,
  context: CommandContext,
): Promise<ExitCode> {
  const { logger, paths } = context;
  const key = loadNodeKey(paths.key);
  if (key === null) {
    logger.error(`No node key found at ${paths.key}. Run rig init --operator <wallet> first.`);
    return EXIT.failure;
  }
  if (isKeyFileShared(paths.key, context.platform)) {
    logger.warn(`Other users can read the node key. Run chmod 600 ${paths.key} to fix it.`);
  }

  const settings = readSettings(paths.settings);
  const network = command.network ?? settings.network;
  const coordinator = command.coordinator ?? settings.coordinators[network] ?? null;
  if (coordinator === null) {
    logger.error(`No coordinator URL is set for ${network}. Pass --coordinator <url> once; it is remembered.`);
    return EXIT.usage;
  }
  if (coordinator !== settings.coordinators[network]) {
    writeSettings(paths.settings, { ...settings, coordinators: { ...settings.coordinators, [network]: coordinator } });
  }

  const [gpu, runtime] = await Promise.all([context.detectGpu(), detectRuntime(command.runtimeUrl)]);
  if (gpu === null) {
    logger.warn('No GPU detected. The node still runs, and the benchmark measures what this machine can do.');
  } else {
    logger.info(`GPU: ${describeGpu(gpu)}.`, { gpuModel: gpu.model, vramMb: gpu.vramMb });
  }
  if (runtime === null) {
    logger.error(
      `No model runtime answered at ${command.runtimeUrl}. Install a local model runtime compatible with the ` +
        '/api/chat interface, start it on port 11434 and download at least one model.',
    );
    return EXIT.noRuntime;
  }
  if (runtime.models.length === 0) {
    logger.warn('The model runtime has no models yet. Download at least one so the node can take jobs.');
  } else {
    logger.info(`Runtime models: ${runtime.models.join(', ')}.`, { models: runtime.models });
  }
  logger.info(`Starting node ${key.address} on ${network} with coordinator ${coordinator}.`, {
    nodeAddress: key.address,
    network,
    coordinator,
  });

  const stop = new AbortController();
  const abort = new AbortController();
  let signals = 0;
  const unsubscribe = context.onStopSignal(() => {
    signals += 1;
    if (signals === 1) {
      logger.info('Stopping. A running job finishes first; press Ctrl+C again to stop at once.');
      stop.abort();
    } else {
      logger.warn('Stopping at once. The running job is abandoned and will be reassigned.');
      abort.abort();
    }
  });

  try {
    await runNode({
      client: createCoordinatorClient({
        baseUrl: coordinator,
        signer: key.account,
        userAgent: `${BRAND.name.toLowerCase()}-rig/${CLIENT_VERSION}`,
      }),
      runJob: createJobRunner(command.runtimeUrl),
      readRuntime: () => detectRuntime(command.runtimeUrl),
      runtime,
      gpu,
      clientVersion: CLIENT_VERSION,
      concurrency: command.concurrency,
      logger,
      stop: stop.signal,
      abort: abort.signal,
    });
  } catch (error) {
    if (!(error instanceof CoordinatorError)) throw error;
    logger.error(`${error.message}${refusalHint(error)}`, { status: error.status });
    return EXIT.failure;
  } finally {
    unsubscribe();
  }
  logger.info('Stopped.');
  return EXIT.ok;
}
