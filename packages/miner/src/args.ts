/**
 * Turns the command line into one validated command. Every value is checked here, at the
 * boundary, so the rest of the client never sees a malformed address or URL.
 */

import { parseArgs } from 'node:util';
import { isNetworkKey, type Address, type NetworkKey } from '@dayagpu/shared';
import { getAddress, isAddress } from 'viem';
import { DEFAULT_RUNTIME_URL } from './runtime.ts';
import { MAX_CONCURRENCY } from './scheduler.ts';

export type Command =
  | { name: 'init'; operator: Address; network: NetworkKey | null; force: boolean }
  | { name: 'code'; operator: Address; network: NetworkKey | null }
  | { name: 'status'; network: NetworkKey | null; runtimeUrl: string }
  | {
      name: 'start';
      coordinator: string | null;
      network: NetworkKey | null;
      runtimeUrl: string;
      concurrency: number;
    }
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
  status                       Show the node key, GPU, model runtime and coordinator.
  start --coordinator <url>    Connect to the coordinator and run jobs until stopped.
  help                         Show this help.

Options:
  --network <testnet|mainnet>  The network to use. Defaults to the one chosen at init.
  --force                      With init: replace an existing node key.
  --coordinator <url>          With start: the coordinator's https URL, remembered per network.
  --runtime-url <url>          The local model runtime. Defaults to ${DEFAULT_RUNTIME_URL}.
  --concurrency <1-${MAX_CONCURRENCY}>          With start: how many jobs run at once. Defaults to 1.
  --quiet, -q                  Print only results, warnings and errors.
  --json                       Print one JSON object per line.
  --version                    Print the client version.`;

const OPTIONS = {
  operator: { type: 'string' },
  network: { type: 'string' },
  force: { type: 'boolean' },
  coordinator: { type: 'string' },
  'runtime-url': { type: 'string' },
  concurrency: { type: 'string' },
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
  status: ['network', 'runtime-url'],
  start: ['coordinator', 'network', 'runtime-url', 'concurrency'],
  help: [],
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

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

function parseNetwork(value: string | undefined): NetworkKey | null {
  if (value === undefined) return null;
  if (!isNetworkKey(value)) throw new UsageError('--network must be testnet or mainnet.');
  return value;
}

function parseUrl(value: string, option: string, requireTls: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`${option} must be a full URL that starts with https://.`);
  }
  if (url.username || url.password) throw new UsageError(`${option} must not contain a user name or password.`);
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && (loopback || !requireTls));
  if (!allowed) {
    throw new UsageError(
      requireTls
        ? `${option} must use https. Plain http is allowed only for this machine.`
        : `${option} must use http or https.`,
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function parseConcurrency(value: string | undefined): number {
  if (value === undefined) return 1;
  const concurrency = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(concurrency >= 1 && concurrency <= MAX_CONCURRENCY)) {
    throw new UsageError(`--concurrency must be a whole number from 1 to ${MAX_CONCURRENCY}.`);
  }
  return concurrency;
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
    case 'status':
      return { name, network: parseNetwork(text('network')), runtimeUrl };
    case 'start': {
      const coordinator = text('coordinator');
      return {
        name,
        coordinator: coordinator === undefined ? null : parseUrl(coordinator, '--coordinator', true),
        network: parseNetwork(text('network')),
        runtimeUrl,
        concurrency: parseConcurrency(text('concurrency')),
      };
    }
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
