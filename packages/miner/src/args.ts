/**
 * Turns the command line into one validated command. Every value is checked here, at the
 * boundary, so the rest of the client never sees a malformed address or URL.
 */

import { parseArgs } from 'node:util';
import { PAIRING_CODE_PATTERN, isNetworkKey, type Address, type NetworkKey } from '@minera/shared';
import { getAddress, isAddress, parseEther } from 'viem';
import { DEFAULT_RUNTIME_URL } from './runtime.ts';
import { MAX_CONCURRENCY } from './scheduler.ts';
import { checkServiceUrl } from './url.ts';

export interface StartCommand {
  name: 'start';
  coordinator: string | null;
  network: NetworkKey | null;
  runtimeUrl: string;
  concurrency: number;
  /** Download the open-job model into the runtime when it is missing. */
  keepModel: boolean;
  /** Claim the operator's rewards once at least this much is claimable; null when off. */
  autoClaimWei: bigint | null;
  /** The chain endpoint for claims; null means the network's default. */
  rpcUrl: string | null;
}

export type Command =
  | { name: 'init'; operator: Address; network: NetworkKey | null; force: boolean }
  | { name: 'code'; operator: Address; network: NetworkKey | null }
  | {
      name: 'pair';
      /** The one-time code from the Deploy page. */
      code: string;
      operator: Address;
      network: NetworkKey | null;
      coordinator: string | null;
      /** Start the node once the rig is deployed, with these options; null to stop there. */
      start: StartCommand | null;
    }
  | { name: 'status'; network: NetworkKey | null; runtimeUrl: string }
  | StartCommand
  | { name: 'help' }
  | { name: 'version' };

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

export type CommandLine =
  | { ok: true; command: Command; output: OutputOptions }
  | { ok: false; error: string; output: OutputOptions };

export const USAGE = `Usage: rig <command> [options]

Commands:
  init --operator <wallet>     Create this rig's node key and print its deploy code.
  code --operator <wallet>     Print the deploy code again, for another wallet or network.
  pair --code <code> --operator <wallet>
                               Hand this machine to the Deploy page, which shows the command with its
                               code, and wait there until the rig is deployed. Creates the node key
                               when there is none.
  status                       Show the node key, GPU, model runtime and coordinator.
  start                        Connect to the network's coordinator and run jobs until stopped.
  help                         Show this help.

Options:
  --network <testnet|mainnet>  The network to use. Defaults to the one chosen at init.
  --force                      With init: replace an existing node key.
  --start                      With pair: start the node as soon as the rig is deployed. The start
                               options below apply to it.
  --coordinator <url>          With start or pair: the coordinator's https URL, remembered per network.
  --runtime-url <url>          The local model runtime. Defaults to ${DEFAULT_RUNTIME_URL}.
  --concurrency <1-${MAX_CONCURRENCY}>          With start: how many jobs run at once. Defaults to 1.
  --keep-model                 With start: download the model open jobs use when the runtime lacks it.
  --auto-claim <eth>           With start: claim the operator's rewards once at least this much ETH is
                               claimable. The node address pays the network fee; the ETH goes to the
                               operator's wallet.
  --rpc-url <url>              With --auto-claim: the chain's https endpoint. Defaults to the network's.
  --quiet, -q                  Print only results, warnings and errors.
  --json                       Print one JSON object per line.
  --version                    Print the client version.`;

const OPTIONS = {
  operator: { type: 'string' },
  code: { type: 'string' },
  network: { type: 'string' },
  force: { type: 'boolean' },
  start: { type: 'boolean' },
  coordinator: { type: 'string' },
  'runtime-url': { type: 'string' },
  concurrency: { type: 'string' },
  'keep-model': { type: 'boolean' },
  'auto-claim': { type: 'string' },
  'rpc-url': { type: 'string' },
  quiet: { type: 'boolean', short: 'q' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
} as const;

type OptionName = keyof typeof OPTIONS;

const GLOBAL_OPTIONS: readonly OptionName[] = ['quiet', 'json', 'help', 'version'];
const COMMAND_OPTIONS: Readonly<Record<string, readonly OptionName[]>> = {
  init: ['operator', 'network', 'force'],
  code: ['operator', 'network'],
  pair: [
    'code',
    'operator',
    'network',
    'coordinator',
    'start',
    'runtime-url',
    'concurrency',
    'keep-model',
    'auto-claim',
    'rpc-url',
  ],
  status: ['network', 'runtime-url'],
  start: ['coordinator', 'network', 'runtime-url', 'concurrency', 'keep-model', 'auto-claim', 'rpc-url'],
  help: [],
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

class UsageError extends Error {}

function parseOperator(value: string | undefined): Address {
  if (value === undefined) {
    throw new UsageError('--operator is required: the wallet address that will deploy this rig.');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new UsageError('--operator must be a wallet address: 0x followed by 40 hexadecimal characters.');
  }
  if (!isAddress(value, { strict: true })) {
    throw new UsageError('--operator has a checksum error. Copy the address from your wallet again.');
  }
  if (value.toLowerCase() === ZERO_ADDRESS) throw new UsageError('--operator cannot be the zero address.');
  return getAddress(value);
}

function parsePairingCode(value: string | undefined): string {
  if (value === undefined) throw new UsageError('--code is required: copy the whole command from the Deploy page.');
  if (!PAIRING_CODE_PATTERN.test(value)) {
    throw new UsageError('--code must be the 32-character code from the Deploy page. Copy the whole command again.');
  }
  return value;
}

function parseNetwork(value: string | undefined): NetworkKey | null {
  if (value === undefined) return null;
  if (!isNetworkKey(value)) throw new UsageError('--network must be testnet or mainnet.');
  return value;
}

function parseUrl(value: string, option: string, requireTls: boolean): string {
  const checked = checkServiceUrl(value, requireTls);
  if (!checked.ok) throw new UsageError(`${option} ${checked.problem}.`);
  return checked.url;
}

function parseConcurrency(value: string | undefined): number {
  if (value === undefined) return 1;
  const concurrency = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(concurrency >= 1 && concurrency <= MAX_CONCURRENCY)) {
    throw new UsageError(`--concurrency must be a whole number from 1 to ${MAX_CONCURRENCY}.`);
  }
  return concurrency;
}

const MAX_CLAIM_THRESHOLD_WEI = 100n * 10n ** 18n;

function parseClaimThreshold(value: string | undefined): bigint | null {
  if (value === undefined) return null;
  if (!/^\d{1,3}(\.\d{1,18})?$/.test(value)) {
    throw new UsageError('--auto-claim must be an amount of ETH, such as 0.001.');
  }
  const wei = parseEther(value);
  if (wei <= 0n || wei > MAX_CLAIM_THRESHOLD_WEI) throw new UsageError('--auto-claim must be more than 0 and at most 100 ETH.');
  return wei;
}

function parseErrorMessage(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  const message = error instanceof Error ? error.message : '';
  const option = /'(-[^']*)'/.exec(message)?.[1];
  switch (code) {
    case 'ERR_PARSE_ARGS_UNKNOWN_OPTION':
      return `Unknown option${option ? ` ${option}` : ''}. Run rig help to see the options.`;
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      return option ? `${option.split(' ')[0]} needs a value.` : 'An option is missing its value.';
    default:
      return 'Could not read the command line. Run rig help to see the commands.';
  }
}

function coordinatorOption(value: string | undefined): string | null {
  return value === undefined ? null : parseUrl(value, '--coordinator', true);
}

function startCommand(
  values: Partial<Record<OptionName, string | boolean>>,
  text: (option: OptionName) => string | undefined,
  runtimeUrl: string,
): StartCommand {
  const autoClaimWei = parseClaimThreshold(text('auto-claim'));
  const rpcUrl = text('rpc-url');
  if (rpcUrl !== undefined && autoClaimWei === null) throw new UsageError('--rpc-url applies only with --auto-claim.');
  return {
    name: 'start',
    coordinator: coordinatorOption(text('coordinator')),
    network: parseNetwork(text('network')),
    runtimeUrl,
    concurrency: parseConcurrency(text('concurrency')),
    keepModel: values['keep-model'] === true,
    autoClaimWei,
    rpcUrl: rpcUrl === undefined ? null : parseUrl(rpcUrl, '--rpc-url', true),
  };
}

function toCommand(name: string, values: Partial<Record<OptionName, string | boolean>>): Command {
  const text = (option: OptionName): string | undefined => {
    const value = values[option];
    return typeof value === 'string' ? value : undefined;
  };
  const allowed = COMMAND_OPTIONS[name];
  if (allowed === undefined) throw new UsageError(`Unknown command "${name}". Run rig help to see the commands.`);
  for (const option of Object.keys(values) as OptionName[]) {
    if (!GLOBAL_OPTIONS.includes(option) && !allowed.includes(option)) {
      throw new UsageError(`--${option} does not apply to ${name}.`);
    }
  }
  const runtimeUrl = parseUrl(text('runtime-url') ?? DEFAULT_RUNTIME_URL, '--runtime-url', false);
  switch (name) {
    case 'init':
      return {
        name,
        operator: parseOperator(text('operator')),
        network: parseNetwork(text('network')),
        force: values.force === true,
      };
    case 'code':
      return { name, operator: parseOperator(text('operator')), network: parseNetwork(text('network')) };
    case 'pair': {
      const start = values.start === true ? startCommand(values, text, runtimeUrl) : null;
      if (start === null) {
        const startOnly = (['runtime-url', 'concurrency', 'keep-model', 'auto-claim', 'rpc-url'] as const).find(
          (option) => values[option] !== undefined,
        );
        if (startOnly !== undefined) throw new UsageError(`--${startOnly} applies to pair only with --start.`);
      }
      return {
        name,
        code: parsePairingCode(text('code')),
        operator: parseOperator(text('operator')),
        network: parseNetwork(text('network')),
        coordinator: start?.coordinator ?? coordinatorOption(text('coordinator')),
        start,
      };
    }
    case 'status':
      return { name, network: parseNetwork(text('network')), runtimeUrl };
    case 'start':
      return startCommand(values, text, runtimeUrl);
    default:
      return { name: 'help' };
  }
}

export function parseCommandLine(argv: readonly string[]): CommandLine {
  const output: OutputOptions = {
    json: argv.includes('--json'),
    quiet: argv.includes('--quiet') || argv.includes('-q'),
  };
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    return { ok: false, error: parseErrorMessage(error), output };
  }
  const { values, positionals } = parsed;
  if (values.version) return { ok: true, command: { name: 'version' }, output };
  const [name, ...extra] = positionals;
  if (values.help || name === undefined) return { ok: true, command: { name: 'help' }, output };
  if (extra.length > 0) {
    return { ok: false, error: `Unexpected argument "${extra[0]}". Run rig help to see the commands.`, output };
  }
  try {
    return { ok: true, command: toCommand(name, values), output };
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return { ok: false, error: error.message, output };
  }
}
