/**
 * The values `{{name}}` placeholders in the docs resolve to. Addresses, parameters and names come
 * from the shared package and the deployment configuration, so the docs cannot drift from them.
 *
 * Each network has its own family, `testnet.*` and `mainnet.*`, and `network.*` repeats the family
 * of the network the site is built for, so a page about the live network reads right on either.
 */

import {
  BRAND,
  CHAINS,
  MAX_CLOCK_SKEW_SECONDS,
  NODE_HEADERS,
  NODE_ROUTES,
  PROTOCOL_VERSION,
  TOKEN,
  deploymentFor,
  isNetworkKey,
  pairListingFor,
  type NetworkKey,
} from '@minera/shared';
import { keccak256 } from 'viem';
import mainnetConfig from '../../../../packages/contracts/deploy/mainnet.json' with { type: 'json' };
import testnetConfig from '../../../../packages/contracts/deploy/testnet.json' with { type: 'json' };

const BPS = 10_000;
const DAY_SECONDS = 86_400;
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const ZERO = '0x0000000000000000000000000000000000000000';

interface DeployConfig {
  chainId: number;
  challengeDelay: number;
  rotationDelay: number;
  releaseBpsPerDay: number;
  listingDelay: number;
  router: string;
  stockRegistry: string;
  routes: readonly { asset: string; fee: number; tickSpacing: number }[];
}

const DEPLOY_CONFIGS: Readonly<Record<NetworkKey, DeployConfig>> = { testnet: testnetConfig, mainnet: mainnetConfig };

function duration(seconds: number): string {
  const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? '' : 's'}`;
  if (seconds % 3_600 === 0) return unit(seconds / 3_600, 'hour');
  if (seconds % 60 === 0) return unit(seconds / 60, 'minute');
  return unit(seconds, 'second');
}

/** A pool fee in hundredths of a basis point, as a percentage. */
function poolFee(fee: number): string {
  return `${(fee / 10_000).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function explorerLink(explorer: string, address: string): string {
  return `[\`${address}\`](${explorer}/address/${address})`;
}

function pairTable(network: NetworkKey): string {
  const chain = CHAINS[network];
  const config = DEPLOY_CONFIGS[network];
  const rows = pairListingFor(chain.id).assets.map((asset) => {
    if (asset.kind === 'native') {
      return `| ${asset.symbol} | \`${asset.address}\` | ${asset.decimals} | Paid directly, no swap | Not applied |`;
    }
    const route = config.routes.find((entry) => entry.asset.toLowerCase() === asset.address.toLowerCase());
    if (!route) throw new Error(`the ${network} pair ${asset.address} has no route in the deployment configuration`);
    const swap = `Swapped at a ${poolFee(route.fee)} pool fee, tick spacing ${route.tickSpacing}`;
    const link = explorerLink(chain.explorerUrl, asset.address);
    return `| ${asset.symbol} | ${link} | ${asset.decimals} | ${swap} | Checked at every claim |`;
  });
  return [
    '| Asset | Address | Decimals | At claim | Pause and blocklist |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** Every value about one network: its chain, its contracts and its parameters. */
function networkEntries(network: NetworkKey): Record<string, string | number> {
  const chain = CHAINS[network];
  const config = DEPLOY_CONFIGS[network];
  const deployment = deploymentFor(chain.id);
  if (!deployment) throw new Error(`no ${network} deployment is recorded in the shared package`);
  if (config.chainId !== chain.id) throw new Error(`the ${network} deployment configuration is for another chain`);
  const rpc = chain.rpcUrls[0];
  if (!rpc) throw new Error(`the ${network} has no RPC URL`);
  const quoter = pairListingFor(chain.id).quoter;
  const release = config.releaseBpsPerDay;
  return {
    label: network,
    Label: network === 'mainnet' ? 'Mainnet' : 'Testnet',
    chainName: chain.name,
    chainId: chain.id,
    chainIdHex: chain.hexId,
    currency: chain.nativeCurrency.symbol,
    rpc,
    explorer: chain.explorerUrl,

    burnPool: deployment.burnPool,
    rigRegistry: deployment.rigRegistry,
    pairZap: deployment.pairZap === ZERO ? 'not deployed yet' : deployment.pairZap,
    guardian: deployment.guardian,
    publisher: deployment.publisher,
    startBlock: deployment.startBlock.toLocaleString('en-US'),
    router: config.router === ZERO ? 'none yet' : config.router,
    stockRegistry: config.stockRegistry === ZERO ? 'none yet' : config.stockRegistry,
    quoter: quoter ?? 'none yet',
    pairTable: pairTable(network),
    pairZapStatus: deployment.pairZap === ZERO ? 'Not deployed yet; claims pay in ETH' : `Live on ${network}`,
    guardianNote:
      network === 'mainnet'
        ? 'On mainnet the guardian is a dedicated key held by the project and used for nothing else.'
        : 'On testnet the guardian is a single key held by the project.',

    challengeDelay: duration(config.challengeDelay),
    challengeDelaySeconds: config.challengeDelay,
    rotationDelay: duration(config.rotationDelay),
    rotationDelaySeconds: config.rotationDelay,
    listingDelay: duration(config.listingDelay),
    listingDelaySeconds: config.listingDelay,
    releaseBpsPerDay: release,
    releasePercentPerDay: `${release / 100}%`,
    fullReleaseDays: BPS / release,
    hourlyReleaseOfOneEth: (Math.floor((release * 3_600 * 1e6) / (BPS * DAY_SECONDS)) / 1e6).toString(),
  };
}

function prefixed(prefix: string, entries: Record<string, string | number>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(entries).map(([name, value]) => [`${prefix}.${name}`, value]));
}

/** The coordinator URL as the site reads it at build time, or a stand-in when none is set. */
function coordinatorUrl(apiBase: string | undefined): string {
  const value = apiBase?.trim() ?? '';
  if (value === '') return '<coordinator URL>';
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('VITE_API_BASE must be an http or https URL');
  return url.href.replace(/\/+$/, '');
}

/** `requested` is the build's VITE_NETWORK; anything else, or nothing, means testnet, as in the app. */
export function placeholderValues(apiBase: string | undefined, requested?: unknown): ReadonlyMap<string, string> {
  const active: NetworkKey = isNetworkKey(requested) ? requested : 'testnet';
  if (!TOKEN.address || !TOKEN.launchedOn) throw new Error('the docs name the token, but its address or launch date is not set');
  const launched = new Date(`${TOKEN.launchedOn}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const entries: Record<string, string | number> = {
    'brand.name': BRAND.name,
    'brand.rewardAllocation': BRAND.rewardAllocation,
    'brand.repository': BRAND.links.github,
    'brand.repoDirectory': BRAND.links.github.split('/').pop() ?? '',
    'brand.configDirectory': BRAND.name.toLowerCase(),
    'brand.nodePackage': BRAND.nodeClient.package,

    'token.symbol': TOKEN.symbol,
    'token.address': TOKEN.address,
    'token.launchedOn': launched,

    ...prefixed('testnet', networkEntries('testnet')),
    ...prefixed('mainnet', networkEntries('mainnet')),
    ...prefixed('network', networkEntries(active)),
    // The flag `rig` needs for the built network; nothing on testnet, which is its default.
    'network.rigFlag': active === 'mainnet' ? ' --network mainnet' : '',

    'protocol.version': PROTOCOL_VERSION,
    'protocol.skewSeconds': MAX_CLOCK_SKEW_SECONDS,
    'protocol.header.key': NODE_HEADERS.key,
    'protocol.header.timestamp': NODE_HEADERS.timestamp,
    'protocol.header.nonce': NODE_HEADERS.nonce,
    'protocol.header.signature': NODE_HEADERS.signature,
    'protocol.route.hello': NODE_ROUTES.hello,
    'protocol.route.heartbeat': NODE_ROUTES.heartbeat,
    'protocol.route.result': NODE_ROUTES.result('JOB').replace('JOB', ':id'),
    'protocol.emptyBodyDigest': keccak256(new Uint8Array()),

    'coordinator.url': coordinatorUrl(apiBase),
  };
  return new Map(Object.entries(entries).map(([name, value]) => [name, String(value)]));
}

/** Replaces every placeholder, and lists the names that have no value. */
export function resolvePlaceholders(
  markdown: string,
  values: ReadonlyMap<string, string>,
): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const text = markdown.replace(PLACEHOLDER, (token, name: string) => {
    const value = values.get(name);
    if (value === undefined) {
      unknown.push(name);
      return token;
    }
    return value;
  });
  if (unknown.length === 0 && text.includes('{{')) unknown.push('a malformed placeholder');
  return { text, unknown };
}
