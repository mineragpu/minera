/**
 * Rental prices: the marketplace bills in US dollars, renters pay in ETH. Amounts are integers
 * throughout: millionths of a dollar ("micros") and wei, rounded up so a quote never undercharges.
 */

import type { PriceSource } from '../config.ts';

const MICROS = 1_000_000n;
const WEI_PER_ETH = 10n ** 18n;
/** What a rented machine downloads on top of its hourly price: the runtime, the model and updates. */
export const TRANSFER_ALLOWANCE_MICROS = 50_000n;
/** Sources more than this far apart are not trusted for a quote. */
const MAX_SPREAD_BPS = 300n;
/** ETH prices outside this range are taken as a broken source. */
const MIN_ETH_USD_MICROS = 100n * MICROS;
const MAX_ETH_USD_MICROS = 1_000_000n * MICROS;

export class PriceUnavailableError extends Error {
  override name = 'PriceUnavailableError';
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

/** Dollars as a decimal string, such as "3.141593", to millionths; null when it is not a price. */
export function parseUsdMicros(value: unknown): bigint | null {
  const text = typeof value === 'number' ? value.toFixed(6) : typeof value === 'string' ? value.trim() : null;
  const match = text === null ? null : /^(\d{1,9})(?:\.(\d{1,18}))?$/.exec(text);
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  return BigInt(whole) * MICROS + BigInt(fraction.padEnd(6, '0').slice(0, 6));
}

export function formatUsd(micros: bigint): string {
  const cents = ceilDiv(micros, 10_000n);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** What `units` of rental cost in dollar micros: the machine's hours, the transfer allowance and the margin. */
export function rentalUsdMicros(usdPerHourMicros: bigint, units: number, unitSeconds: number, marginBps: number): bigint {
  const hours = BigInt(units) * BigInt(unitSeconds);
  const cost = ceilDiv(usdPerHourMicros * hours, 3_600n) + TRANSFER_ALLOWANCE_MICROS;
  return ceilDiv(cost * BigInt(10_000 + marginBps), 10_000n);
}

/** Dollar micros in wei at `ethUsdMicros` dollars per ETH, rounded up. */
export function usdToWei(usdMicros: bigint, ethUsdMicros: bigint): bigint {
  return ceilDiv(usdMicros * WEI_PER_ETH, ethUsdMicros);
}

function valueAt(body: unknown, path: string): unknown {
  let value = body;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = Array.isArray(value) ? value[Number(key)] : (value as Record<string, unknown>)[key];
  }
  return value;
}

export type JsonFetcher = (url: string, signal: AbortSignal) => Promise<unknown>;

const fetchJson: JsonFetcher = async (url, signal) => {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' }, redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

/**
 * The ETH price in dollar micros: the median of the sources that answered with a sane price. With
 * two or more answers, they must agree within 3%.
 */
export async function readEthUsd(sources: readonly PriceSource[], fetcher: JsonFetcher = fetchJson): Promise<bigint> {
  const prices = await Promise.all(
    sources.map(async (source) => {
      try {
        const price = parseUsdMicros(valueAt(await fetcher(source.url, AbortSignal.timeout(8_000)), source.path));
        return price !== null && price >= MIN_ETH_USD_MICROS && price <= MAX_ETH_USD_MICROS ? price : null;
      } catch {
        return null;
      }
    }),
  );
  const good = prices.filter((price): price is bigint => price !== null).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (good.length === 0) throw new PriceUnavailableError('no ETH price source answered');
  const low = good[0] ?? 0n;
  const high = good[good.length - 1] ?? 0n;
  if ((high - low) * 10_000n > low * MAX_SPREAD_BPS) throw new PriceUnavailableError('the ETH price sources disagree');
  const middle = Math.floor(good.length / 2);
  return good.length % 2 === 1 ? (good[middle] ?? low) : ((good[middle - 1] ?? low) + (good[middle] ?? high)) / 2n;
}

/** Reads the ETH price at most once a minute. */
export function cachedEthUsd(read: () => Promise<bigint>, ttlMs = 60_000, now: () => number = Date.now): () => Promise<bigint> {
  let cached: { at: number; value: bigint } | null = null;
  return async () => {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    const value = await read();
    cached = { at: now(), value };
    return value;
  };
}
