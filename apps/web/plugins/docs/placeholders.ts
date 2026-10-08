/**
 * The values `{{name}}` placeholders in the docs resolve to. Addresses, parameters and names come
 * from the shared package and the deployment configuration, so the docs cannot drift from them.
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
  pairListingFor,
} from '@minera/shared';
import { keccak256 } from 'viem';
import testnetConfig from '../../../../packages/contracts/deploy/testnet.json' with { type: 'json' };

const BPS = 10_000;
const DAY_SECONDS = 86_400;
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

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

function pairTable(): string {
  const chain = CHAINS.testnet;
  const listing = pairListingFor(chain.id);
  const rows = listing.assets.map((asset) => {
    if (asset.kind === 'native') {
      return `| ${asset.symbol} | \`${asset.address}\` | ${asset.decimals} | Paid directly, no swap | Not applied |`;
    }
    const route = testnetConfig.routes.find((entry) => entry.asset.toLowerCase() === asset.address.toLowerCase());
    if (!route) throw new Error(`the testnet pair ${asset.address} has no route in the deployment configuration`);
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

/** The coordinator URL as the site reads it at build time, or a stand-in when none is set. */
function coordinatorUrl(apiBase: string | undefined): string {
  const value = apiBase?.trim() ?? '';
  if (value === '') return '<coordinator URL>';
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('VITE_API_BASE must be an http or https URL');
  return url.href.replace(/\/+$/, '');
}

export function placeholderValues(apiBase: string | undefined): ReadonlyMap<string, string> {
  const chain = CHAINS.testnet;
  const deployment = deploymentFor(chain.id);
  if (!deployment) throw new Error('no testnet deployment is recorded in the shared package');
  if (testnetConfig.chainId !== chain.id) throw new Error('the testnet deployment configuration is for another chain');
  const quoter = pairListingFor(chain.id).quoter;
  if (!TOKEN.address || !TOKEN.launchedOn) throw new Error('the docs name the token, but its address or launch date is not set');
  const launched = new Date(`${TOKEN.launchedOn}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (!quoter) throw new Error('the testnet pair listing has no quoter');
  const rpc = chain.rpcUrls[0];
  if (!rpc) throw new Error('the testnet has no RPC URL');

  const release = testnetConfig.releaseBpsPerDay;
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

    'testnet.chainName': chain.name,
    'testnet.chainId': chain.id,
    'testnet.chainIdHex': chain.hexId,
    'testnet.currency': chain.nativeCurrency.symbol,
    'testnet.rpc': rpc,
    'testnet.explorer': chain.explorerUrl,

    'testnet.burnPool': deployment.burnPool,
    'testnet.rigRegistry': deployment.rigRegistry,
    'testnet.pairZap': deployment.pairZap,
    'testnet.guardian': deployment.guardian,
    'testnet.publisher': deployment.publisher,
    'testnet.startBlock': deployment.startBlock.toLocaleString('en-US'),
    'testnet.router': testnetConfig.router,
    'testnet.stockRegistry': testnetConfig.stockRegistry,
    'testnet.quoter': quoter,
    'testnet.pairTable': pairTable(),

    'testnet.challengeDelay': duration(testnetConfig.challengeDelay),
    'testnet.challengeDelaySeconds': testnetConfig.challengeDelay,
    'testnet.rotationDelay': duration(testnetConfig.rotationDelay),
    'testnet.rotationDelaySeconds': testnetConfig.rotationDelay,
    'testnet.listingDelay': duration(testnetConfig.listingDelay),
    'testnet.listingDelaySeconds': testnetConfig.listingDelay,
    'testnet.releaseBpsPerDay': release,
    'testnet.releasePercentPerDay': `${release / 100}%`,
    'testnet.fullReleaseDays': BPS / release,
    'testnet.hourlyReleaseOfOneEth': (Math.floor((release * 3_600 * 1e6) / (BPS * DAY_SECONDS)) / 1e6).toString(),

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
