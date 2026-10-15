/**
 * Autopilot: the chores an operator, or an agent acting for one, would otherwise do by hand. While
 * the node runs, it checks every few minutes:
 * - the rig's standing with Sentinel, and says when it changes;
 * - with --keep-model, that the runtime has the model open jobs use, and downloads it if not;
 * - with --auto-claim, whether the operator can claim at least the chosen amount, and claims it.
 *   The Burn Pool pays the operator's wallet; the node key only pays the network fee.
 */

import type { Address, Hex } from '@minera/shared';
import { describeClaimFailure, operatorOf, readyClaim, type SendClaim } from './claim.ts';
import type { Logger } from './logger.ts';
import { isModelName } from './runtime.ts';
import { endpoint } from './url.ts';
import { sleep } from './wait.ts';

export const AUTOPILOT_INTERVAL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const STANDINGS = new Set(['probation', 'trusted', 'quarantined']);

export interface AutopilotOptions {
  coordinator: string;
  nodeAddress: Address;
  logger: Logger;
  /** Keep the open-job model installed. */
  keepModel: {
    listModels: () => Promise<string[] | null>;
    pull: (model: string, signal: AbortSignal) => Promise<void>;
  } | null;
  /** Claim once at least `minWei` is claimable. */
  claim: { minWei: bigint; send: SendClaim } | null;
  fetch?: typeof fetch;
}

/** What the autopilot remembers between checks. */
export interface AutopilotState {
  standing: string | null;
  /** The settlement and amount last claimed, so the same claim is not sent twice. */
  claimed: string | null;
  /** The last warning given, so a problem that persists is reported once. */
  warned: string | null;
}

export const initialAutopilotState = (): AutopilotState => ({ standing: null, claimed: null, warned: null });

const formatEth = (wei: bigint): string => {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
};

async function getJson(fetchImpl: typeof fetch, base: string, route: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(endpoint(base, route), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok) throw new Error(`The coordinator answered ${response.status} for ${route}.`);
  return (await response.json()) as unknown;
}

/** Downloads the model open jobs use when the runtime does not have it. Returns the model. */
export async function ensureModel(options: AutopilotOptions, signal: AbortSignal): Promise<string | null> {
  const { keepModel, logger } = options;
  if (keepModel === null) return null;
  const network = await getJson(options.fetch ?? fetch, options.coordinator, '/v1/network', signal);
  const jobs = typeof network === 'object' && network !== null ? (network as Record<string, unknown>)['jobs'] : undefined;
  const model = typeof jobs === 'object' && jobs !== null ? (jobs as Record<string, unknown>)['model'] : undefined;
  if (!isModelName(model)) throw new Error('The coordinator did not name a valid model for open jobs.');
  const installed = await keepModel.listModels();
  if (installed === null) throw new Error('The model runtime is not answering.');
  if (installed.includes(model)) return model;
  logger.info(`Open jobs use ${model}, which the runtime does not have. Downloading it.`, { model });
  await keepModel.pull(model, signal);
  logger.info(`Downloaded ${model}.`, { model });
  return model;
}

/** One round of checks. Never throws: each problem is logged, once while it persists. */
export async function autopilotStep(options: AutopilotOptions, state: AutopilotState, signal: AbortSignal): Promise<AutopilotState> {
  const { logger } = options;
  const fetchImpl = options.fetch ?? fetch;
  const next = { ...state };
  const warn = (message: string): void => {
    if (next.warned !== message) logger.warn(message);
    next.warned = message;
  };
  try {
    const rig = await getJson(fetchImpl, options.coordinator, `/v1/rigs/${options.nodeAddress}`, signal);
    const standing = typeof rig === 'object' && rig !== null ? (rig as Record<string, unknown>)['standing'] : undefined;
    if (typeof standing === 'string' && STANDINGS.has(standing) && standing !== state.standing) {
      if (state.standing === null) logger.info(`Sentinel standing: ${standing}.`, { standing });
      else if (standing === 'quarantined') logger.warn(`Sentinel moved this rig from ${state.standing} to quarantined. It gets no work until the quarantine ends.`, { standing });
      else logger.info(`Sentinel standing changed from ${state.standing} to ${standing}.`, { standing });
      next.standing = standing;
    }

    await ensureModel(options, signal);

    if (options.claim !== null) {
      const operator = operatorOf(rig);
      const claim = readyClaim(await getJson(fetchImpl, options.coordinator, `/v1/claims/${operator}`, signal));
      const key = claim === null ? null : `${claim.index}:${claim.cumulative}`;
      if (claim !== null && key !== state.claimed && claim.claimable >= options.claim.minWei) {
        logger.info(`Claiming ${formatEth(claim.claimable)} ETH for ${operator} from settlement ${claim.index}.`, {
          operator,
          settlement: claim.index,
          wei: claim.claimable.toString(),
        });
        let hash: Hex;
        try {
          hash = await options.claim.send(operator, claim);
        } catch (error) {
          warn(describeClaimFailure(error, options.nodeAddress));
          return next;
        }
        logger.result(`Claimed ${formatEth(claim.claimable)} ETH for ${operator}. Transaction ${hash}.`, { operator, transaction: hash });
        next.claimed = key;
      }
    }
    next.warned = null;
  } catch (error) {
    if (signal.aborted) return next;
    warn(`Autopilot check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return next;
}

/** Runs the checks until `stop`, starting after `firstDelayMs`. */
export async function runAutopilot(
  options: AutopilotOptions,
  stop: AbortSignal,
  timing: { firstDelayMs: number; intervalMs: number } = { firstDelayMs: 30_000, intervalMs: AUTOPILOT_INTERVAL_MS },
): Promise<void> {
  let state = initialAutopilotState();
  await sleep(timing.firstDelayMs, stop);
  while (!stop.aborted) {
    state = await autopilotStep(options, state, stop);
    await sleep(timing.intervalMs, stop);
  }
}
