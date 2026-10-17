/**
 * `rig pair`: hand this machine to the Deploy page under the page's one-time code, then wait until
 * the operator deploys the rig there. With --start, the node starts as soon as it is deployed.
 *
 * Only the node address, the deploy code and the card's model and memory leave the machine. The
 * node key stays in its file.
 */

import {
  PAIRING_ROUTES,
  PAIRING_TTL_SECONDS,
  resolveCoordinator,
  type Address,
  type PairingRequest,
} from '@minera/shared';
import type { Command } from '../args.ts';
import { createDeployCode, deployTargetFor } from '../deploy-code.ts';
import { createNodeKey, loadNodeKey } from '../keystore.ts';
import { sanitize, type Logger } from '../logger.ts';
import { readSettings, writeSettings } from '../settings.ts';
import { checkServiceUrl, endpoint } from '../url.ts';
import { CLIENT_VERSION } from '../version.ts';
import { createBackoff, sleep } from '../wait.ts';
import { notDeployed } from './code.ts';
import { EXIT, type CommandContext, type ExitCode } from './context.ts';
import { startCommand } from './start.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const POLL_MS = 10_000;
const REMIND_MS = 5 * 60_000;
const PAIR_ATTEMPTS = 6;

type PairCommand = Extract<Command, { name: 'pair' }>;

/** A reply the command can act on, or null when no reply arrived. */
async function call(url: URL, init: RequestInit): Promise<{ status: number; message: string } | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', 'user-agent': `minera-rig/${CLIENT_VERSION}` },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = (await response.text().catch(() => '')).slice(0, 4_096);
    let message = '';
    try {
      const body = JSON.parse(text) as { error?: { message?: unknown } };
      if (typeof body.error?.message === 'string') message = sanitize(body.error.message).slice(0, 200);
    } catch {
      message = '';
    }
    return { status: response.status, message };
  } catch {
    return null;
  }
}

/** Whether the coordinator knows the rig as deployed; null when it could not be asked. */
async function isDeployed(coordinator: string, nodeAddress: Address): Promise<boolean | null> {
  const reply = await call(endpoint(coordinator, `/v1/rigs/${nodeAddress}`), { method: 'GET' });
  if (reply === null || (reply.status !== 200 && reply.status !== 404)) return null;
  return reply.status === 200;
}

async function sendPairing(
  logger: Logger,
  coordinator: string,
  request: PairingRequest,
  signal: AbortSignal,
): Promise<boolean> {
  const backoff = createBackoff({ baseMs: 2_000, capMs: 30_000 });
  for (let attempt = 1; attempt <= PAIR_ATTEMPTS && !signal.aborted; attempt += 1) {
    const reply = await call(endpoint(coordinator, PAIRING_ROUTES.create), {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (reply?.status === 201) return true;
    if (reply !== null && reply.status < 500 && reply.status !== 408 && reply.status !== 429) {
      logger.error(
        `The coordinator refused the pairing (HTTP ${reply.status}${reply.message ? `: ${reply.message}` : ''}). ` +
          'Open the Deploy page again and copy the new command.',
      );
      return false;
    }
    logger.warn(`Could not reach the coordinator to pair (attempt ${attempt} of ${PAIR_ATTEMPTS}); trying again.`);
    await sleep(backoff.next(), signal);
  }
  if (!signal.aborted) logger.error(`Could not reach the coordinator at ${coordinator}. Check this machine's internet connection.`);
  return false;
}

export async function pairCommand(command: PairCommand, context: CommandContext): Promise<ExitCode> {
  const { logger, paths } = context;
  const settings = readSettings(paths.settings);
  const network = command.network ?? settings.network;
  const target = deployTargetFor(network);
  if (target === null) return notDeployed(logger, network);

  const saved = settings.coordinators[network];
  const { url: coordinator } = resolveCoordinator(network, command.coordinator, saved);
  const checked = checkServiceUrl(coordinator, true);
  if (!checked.ok) {
    logger.error(`The saved coordinator URL for ${network} ${checked.problem}. Pass --coordinator <url> to replace it.`);
    return EXIT.usage;
  }

  let key = loadNodeKey(paths.key);
  if (key === null) {
    key = createNodeKey(paths.key, { force: false });
    logger.result(`Created a node key at ${paths.key}. Keep this file private and back it up; it is this rig's identity.`, {
      keyPath: paths.key,
    });
  }
  writeSettings(paths.settings, {
    ...settings,
    network,
    coordinators: { ...settings.coordinators, [network]: coordinator },
  });

  const stop = new AbortController();
  const release = context.onStopSignal(() => stop.abort());
  try {
    if ((await isDeployed(coordinator, key.address)) === true) {
      logger.result(`The rig with node address ${key.address} is already deployed.`, { nodeAddress: key.address });
    } else {
      const gpu = await context.detectGpu();
      const request: PairingRequest = {
        code: command.code,
        nodeAddress: key.address,
        operator: command.operator,
        deployCode: await createDeployCode(key.account, target, command.operator),
        gpu: gpu === null ? null : { model: gpu.model, vramMb: gpu.vramMb },
        clientVersion: CLIENT_VERSION,
      };
      if (!(await sendPairing(logger, coordinator, request, stop.signal))) return EXIT.failure;
      logger.result(`Paired with the Deploy page. Node address: ${key.address}.`, { nodeAddress: key.address });
      logger.result(
        `Finish on the Deploy page: name the rig, choose its pair and deploy it from wallet ${command.operator}. ` +
          'This window waits until it is deployed.',
      );

      const deadline = Date.now() + PAIRING_TTL_SECONDS * 1000;
      let remindAt = Date.now() + REMIND_MS;
      while ((await isDeployed(coordinator, key.address)) !== true) {
        if (Date.now() >= deadline) {
          logger.error('The pairing expired before the rig was deployed. Open the Deploy page again for a new command.');
          return EXIT.failure;
        }
        if (Date.now() >= remindAt) {
          logger.info('Still waiting for the rig to be deployed on the Deploy page.');
          remindAt = Date.now() + REMIND_MS;
        }
        await sleep(POLL_MS, stop.signal);
        if (stop.signal.aborted) {
          logger.info('Stopped waiting. Run the same command again to keep waiting for the deployment.');
          return EXIT.failure;
        }
      }
      logger.result('The rig is deployed.', { nodeAddress: key.address, deployed: true });
    }
  } finally {
    release();
  }

  if (command.start === null) {
    logger.result(`Start the node with: rig start --network ${network}`);
    return EXIT.ok;
  }
  return startCommand({ ...command.start, network, coordinator }, context);
}
