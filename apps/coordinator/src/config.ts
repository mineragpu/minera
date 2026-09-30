import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  CHAINS,
  deploymentFor,
  type ChainConfig,
  type Deployment,
  type Hex,
  type NetworkKey,
} from '@minera/shared';
import { Secret } from './secret.ts';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface Config {
  port: number;
  host: string;
  databaseUrl: Secret<string>;
  network: NetworkKey;
  chain: ChainConfig;
  deployment: Deployment;
  /** The first entry is tried first; the rest are fallbacks, in order. */
  rpcUrls: readonly string[];
  /** Without a key, settlement runs in dry mode and never publishes. */
  publisherKey: Secret<Hex> | null;
  corsOrigins: readonly string[];
  epochSeconds: number;
  heartbeatSeconds: number;
  /** Share of playground jobs that are also sent to a second rig for comparison. */
  redundancyRate: number;
  playground: { model: string; maxTokens: number };
  /** Reverse proxies in front of the service, so the client address is read from the right hop. */
  trustProxyHops: number;
  sentinel: {
    /** Tokens per second a rig must reach on the network's model to keep taking open work. */
    minTokensPerSecond: number;
    /** Keys the digest rigs' networks are stored as. Without one, a fresh key is drawn at start. */
    networkSalt: Secret<string>;
  };
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const httpUrl = z.url({ protocol: /^https?$/ });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  RPC_URL: z.string().optional(),
  PUBLISHER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex key')
    .optional(),
  CORS_ORIGINS: z.string().optional(),
  EPOCH_SECONDS: z.coerce.number().int().min(60).max(7 * 86_400).default(3_600),
  HEARTBEAT_SECONDS: z.coerce.number().int().min(5).max(600).default(30),
  REDUNDANCY_RATE: z.coerce.number().min(0).max(1).default(0.2),
  PLAYGROUND_MAX_TOKENS: z.coerce.number().int().min(1).max(4_096).default(256),
  PLAYGROUND_MODEL: z.string().trim().min(1).max(128).default('llama3.2:1b'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  SENTINEL_MIN_TOKENS_PER_SECOND: z.coerce.number().min(0).max(100_000).default(40),
  SENTINEL_NETWORK_SALT: z.string().min(16, 'must be at least 16 characters').optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || 'environment'} ${issue.message}`).join('; ');
}

/** Read the service configuration. Error messages name the variable but never echo its value. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  // Platforms often define a variable with an empty value; treat that as unset so defaults apply.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) throw new ConfigError(`invalid configuration: ${describeIssues(parsed.error.issues)}`);
  const values = parsed.data;

  const chain = CHAINS[values.NETWORK];
  const deployment = deploymentFor(chain.id);
  if (!deployment) throw new ConfigError(`no contract deployment is recorded for ${values.NETWORK}`);

  const rpcUrls = splitList(values.RPC_URL);
  for (const url of rpcUrls) {
    if (!httpUrl.safeParse(url).success) {
      throw new ConfigError('invalid configuration: RPC_URL must list http or https URLs');
    }
  }

  const corsOrigins = splitList(values.CORS_ORIGINS);
  for (const origin of corsOrigins) {
    if (!httpUrl.safeParse(origin).success) {
      throw new ConfigError('invalid configuration: CORS_ORIGINS must list http or https origins');
    }
  }

  return {
    port: values.PORT,
    host: '::',
    databaseUrl: new Secret(values.DATABASE_URL),
    network: values.NETWORK,
    chain,
    deployment,
    rpcUrls: rpcUrls.length > 0 ? rpcUrls : [...chain.rpcUrls],
    publisherKey: values.PUBLISHER_PRIVATE_KEY ? new Secret(values.PUBLISHER_PRIVATE_KEY as Hex) : null,
    corsOrigins,
    epochSeconds: values.EPOCH_SECONDS,
    heartbeatSeconds: values.HEARTBEAT_SECONDS,
    redundancyRate: values.REDUNDANCY_RATE,
    playground: { model: values.PLAYGROUND_MODEL, maxTokens: values.PLAYGROUND_MAX_TOKENS },
    trustProxyHops: values.TRUST_PROXY_HOPS,
    sentinel: {
      minTokensPerSecond: values.SENTINEL_MIN_TOKENS_PER_SECOND,
      networkSalt: new Secret(values.SENTINEL_NETWORK_SALT ?? randomBytes(32).toString('hex')),
    },
    logLevel: values.LOG_LEVEL,
  };
}

/** What is safe to log at startup: no credentials, and RPC endpoints by host only. */
export function configSummary(config: Config): Record<string, unknown> {
  return {
    network: config.network,
    chainId: config.chain.id,
    rpcHosts: config.rpcUrls.map((url) => new URL(url).host),
    publisher: config.publisherKey ? 'configured' : 'dry mode',
    corsOrigins: config.corsOrigins,
    epochSeconds: config.epochSeconds,
    heartbeatSeconds: config.heartbeatSeconds,
    redundancyRate: config.redundancyRate,
    playground: config.playground,
    sentinel: { minTokensPerSecond: config.sentinel.minTokensPerSecond },
  };
}
