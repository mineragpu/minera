import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  CHAINS,
  deploymentFor,
  type Address,
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
  /**
   * The first entry is tried first; the rest are fallbacks, in order. Held as a secret because an
   * endpoint can carry an API key or `user:password@` credentials.
   */
  rpcUrls: Secret<readonly string[]>;
  /** How often the chain is read, and how many blocks one log request covers at most. */
  chainPolling: { indexMs: number; poolMs: number; logRange: number };
  /** Without a key, settlement runs in dry mode and never publishes. */
  publisherKey: Secret<Hex> | null;
  corsOrigins: readonly string[];
  epochSeconds: number;
  heartbeatSeconds: number;
  /** Share of playground jobs that are also sent to a second rig for comparison. */
  redundancyRate: number;
  /**
   * The most paid units per epoch that prompts from one network can earn, and that one pair of rigs
   * verifying each other can earn; 0 means no limit.
   */
  workLimits: { perOrigin: number; perPair: number };
  /** The most one paid unit can earn in a settlement, in wei as a decimal string; "0" means no limit. */
  rewardMaxWeiPerUnit: string;
  playground: { model: string; maxTokens: number };
  /** Reverse proxies in front of the service, so the client address is read from the right hop. */
  trustProxyHops: number;
  sentinel: {
    /** Tokens per second a rig must reach on the network's model to keep taking open work. */
    minTokensPerSecond: number;
    /** Keys the digest rigs' networks are stored as. Without one, a fresh key is drawn at start. */
    networkSalt: Secret<string>;
  };
  /** Renting GPU machines from the Deploy page; null when it is off. */
  rentals: RentalConfig | null;
  logLevel: LogLevel;
}

/** A public price source: a JSON URL and the dotted path to the US dollar price of one ETH in it. */
export interface PriceSource {
  url: string;
  path: string;
}

export interface RentalConfig {
  market: {
    /** The GPU marketplace's API root, such as https://host; the API paths are appended. */
    url: string;
    apiKey: Secret<string>;
    /** The container image the machine runs; the rig script installs the rest. */
    image: string;
    diskGb: number;
    minGpuRamMb: number;
    /** The host's uptime record, from 0 to 1. */
    minReliability: number;
    /** The most one machine may cost an hour, in millionths of a US dollar. */
    maxUsdPerHourMicros: bigint;
  };
  /** Where renters pay. */
  payTo: Address;
  /** The hot wallet refunds are sent from. It holds only a small float. */
  refundKey: Secret<Hex>;
  marginBps: number;
  /** Rentals that hold or are about to hold a machine at once. */
  maxActive: number;
  quoteSeconds: number;
  /** How long a launched machine has to pair before it is replaced. */
  startTimeoutSeconds: number;
  ethUsdSources: readonly PriceSource[];
  /** Seconds in one rental unit: a day, or an hour on testnet for end-to-end tests. */
  unitSeconds: number;
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
  INDEX_POLL_SECONDS: z.coerce.number().int().min(1).max(300).default(5),
  POOL_REFRESH_SECONDS: z.coerce.number().int().min(5).max(3_600).default(15),
  INDEX_LOG_RANGE: z.coerce.number().int().min(10).max(100_000).default(5_000),
  REDUNDANCY_RATE: z.coerce.number().min(0).max(1).default(0.2),
  REWARD_MAX_UNITS_PER_ORIGIN: z.coerce.number().int().min(0).max(100_000_000).default(2_000),
  REWARD_MAX_UNITS_PER_PAIR: z.coerce.number().int().min(0).max(100_000_000).default(2_000),
  REWARD_MAX_WEI_PER_UNIT: z.string().regex(/^\d{1,30}$/, 'must be a whole number of wei').default('100000000000'),
  PLAYGROUND_MAX_TOKENS: z.coerce.number().int().min(1).max(4_096).default(256),
  PLAYGROUND_MODEL: z.string().trim().min(1).max(128).default('llama3.2:1b'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  SENTINEL_MIN_TOKENS_PER_SECOND: z.coerce.number().min(0).max(100_000).default(40),
  SENTINEL_NETWORK_SALT: z.string().min(16, 'must be at least 16 characters').optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RENTALS: z.enum(['on', 'off']).default('off'),
  RENTAL_MARKET_URL: z.url({ protocol: /^https$/ }).optional(),
  RENTAL_MARKET_API_KEY: z.string().min(16).max(512).optional(),
  RENTAL_MARKET_IMAGE: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9@._-]+)?(@sha256:[0-9a-f]{64})?$/, 'must be an image reference')
    .optional(),
  RENTAL_DISK_GB: z.coerce.number().int().min(10).max(200).default(30),
  RENTAL_MIN_GPU_RAM_MB: z.coerce.number().int().min(4_000).max(200_000).default(8_000),
  RENTAL_MIN_RELIABILITY: z.coerce.number().min(0.9).max(1).default(0.98),
  RENTAL_MAX_USD_PER_HOUR: z.coerce.number().positive().max(5).default(0.25),
  RENTAL_PAY_TO: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be an address').optional(),
  RENTAL_REFUND_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex key')
    .optional(),
  RENTAL_MARGIN_BPS: z.coerce.number().int().min(0).max(10_000).default(2_000),
  RENTAL_MAX_ACTIVE: z.coerce.number().int().min(1).max(500).default(10),
  RENTAL_QUOTE_SECONDS: z.coerce.number().int().min(120).max(3_600).default(900),
  RENTAL_START_TIMEOUT_SECONDS: z.coerce.number().int().min(300).max(7_200).default(2_700),
  RENTAL_ETH_USD_SOURCES: z.string().optional(),
  RENTAL_UNIT_SECONDS: z.coerce.number().int().default(86_400),
});

const priceSourcesSchema = z
  .array(
    z.strictObject({
      url: z.url({ protocol: /^https$/ }),
      path: z.string().regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/, 'must be a dotted path'),
    }),
  )
  .min(1)
  .max(5);

type EnvValues = z.output<typeof envSchema>;

/** The rental settings, or null when rentals are off. Every setting they need must be present. */
function rentalConfig(values: EnvValues): RentalConfig | null {
  if (values.RENTALS === 'off') return null;
  const required = [
    'RENTAL_MARKET_URL',
    'RENTAL_MARKET_API_KEY',
    'RENTAL_MARKET_IMAGE',
    'RENTAL_PAY_TO',
    'RENTAL_REFUND_PRIVATE_KEY',
    'RENTAL_ETH_USD_SOURCES',
  ] as const;
  const missing = required.filter((name) => values[name] === undefined);
  if (missing.length > 0) throw new ConfigError(`invalid configuration: RENTALS=on needs ${missing.join(', ')}`);
  if (values.RENTAL_UNIT_SECONDS !== 86_400 && !(values.NETWORK === 'testnet' && values.RENTAL_UNIT_SECONDS === 3_600)) {
    throw new ConfigError('invalid configuration: RENTAL_UNIT_SECONDS must be 86400, or 3600 on testnet');
  }
  let sources: unknown;
  try {
    sources = JSON.parse(values.RENTAL_ETH_USD_SOURCES ?? '');
  } catch {
    throw new ConfigError('invalid configuration: RENTAL_ETH_USD_SOURCES must be JSON');
  }
  const parsedSources = priceSourcesSchema.safeParse(sources);
  if (!parsedSources.success) {
    throw new ConfigError('invalid configuration: RENTAL_ETH_USD_SOURCES must list 1 to 5 {url, path} https sources');
  }
  return {
    market: {
      url: (values.RENTAL_MARKET_URL ?? '').replace(/\/+$/, ''),
      apiKey: new Secret(values.RENTAL_MARKET_API_KEY ?? ''),
      image: values.RENTAL_MARKET_IMAGE ?? '',
      diskGb: values.RENTAL_DISK_GB,
      minGpuRamMb: values.RENTAL_MIN_GPU_RAM_MB,
      minReliability: values.RENTAL_MIN_RELIABILITY,
      maxUsdPerHourMicros: BigInt(Math.round(values.RENTAL_MAX_USD_PER_HOUR * 1_000_000)),
    },
    payTo: (values.RENTAL_PAY_TO ?? '').toLowerCase() as Address,
    refundKey: new Secret((values.RENTAL_REFUND_PRIVATE_KEY ?? '') as Hex),
    marginBps: values.RENTAL_MARGIN_BPS,
    maxActive: values.RENTAL_MAX_ACTIVE,
    quoteSeconds: values.RENTAL_QUOTE_SECONDS,
    startTimeoutSeconds: values.RENTAL_START_TIMEOUT_SECONDS,
    ethUsdSources: parsedSources.data,
    unitSeconds: values.RENTAL_UNIT_SECONDS,
  };
}

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
    rpcUrls: new Secret(rpcUrls.length > 0 ? rpcUrls : [...chain.rpcUrls]),
    chainPolling: {
      indexMs: values.INDEX_POLL_SECONDS * 1000,
      poolMs: values.POOL_REFRESH_SECONDS * 1000,
      logRange: values.INDEX_LOG_RANGE,
    },
    publisherKey: values.PUBLISHER_PRIVATE_KEY ? new Secret(values.PUBLISHER_PRIVATE_KEY as Hex) : null,
    corsOrigins,
    epochSeconds: values.EPOCH_SECONDS,
    heartbeatSeconds: values.HEARTBEAT_SECONDS,
    redundancyRate: values.REDUNDANCY_RATE,
    workLimits: { perOrigin: values.REWARD_MAX_UNITS_PER_ORIGIN, perPair: values.REWARD_MAX_UNITS_PER_PAIR },
    rewardMaxWeiPerUnit: values.REWARD_MAX_WEI_PER_UNIT,
    playground: { model: values.PLAYGROUND_MODEL, maxTokens: values.PLAYGROUND_MAX_TOKENS },
    trustProxyHops: values.TRUST_PROXY_HOPS,
    sentinel: {
      minTokensPerSecond: values.SENTINEL_MIN_TOKENS_PER_SECOND,
      networkSalt: new Secret(values.SENTINEL_NETWORK_SALT ?? randomBytes(32).toString('hex')),
    },
    rentals: rentalConfig(values),
    logLevel: values.LOG_LEVEL,
  };
}

/** What is safe to log at startup: no credentials, and RPC endpoints by host only. */
export function configSummary(config: Config): Record<string, unknown> {
  return {
    network: config.network,
    chainId: config.chain.id,
    rpcHosts: config.rpcUrls.reveal().map((url) => new URL(url).host),
    chainPolling: config.chainPolling,
    publisher: config.publisherKey ? 'configured' : 'dry mode',
    corsOrigins: config.corsOrigins,
    epochSeconds: config.epochSeconds,
    heartbeatSeconds: config.heartbeatSeconds,
    redundancyRate: config.redundancyRate,
    workLimits: config.workLimits,
    rewardMaxWeiPerUnit: config.rewardMaxWeiPerUnit,
    playground: config.playground,
    sentinel: { minTokensPerSecond: config.sentinel.minTokensPerSecond },
    rentals: config.rentals
      ? {
          marketHost: new URL(config.rentals.market.url).host,
          payTo: config.rentals.payTo,
          marginBps: config.rentals.marginBps,
          maxActive: config.rentals.maxActive,
          maxUsdPerHour: Number(config.rentals.market.maxUsdPerHourMicros) / 1_000_000,
          unitSeconds: config.rentals.unitSeconds,
        }
      : 'off',
  };
}
