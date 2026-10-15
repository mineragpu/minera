/**
 * The figures a report is built from, read from the coordinator's public API. Every number in a
 * report comes from here, formatted by code; the network never writes a figure.
 */

import type { MineraApi } from '@minera-gpu/mcp/api';

export interface Facts {
  network: string;
  chainId: number;
  rigsTotal: number;
  rigsOnline: number;
  verifiedUnits24h: string;
  answers24h: number;
  poolBurned: string;
  poolCommitted: string;
  campaignBurns: number;
  epoch: number;
  /** The rigs with the most verified work this epoch, by name. */
  topRigs: string[];
  /** When the pool figures were read on chain. */
  asOf: string;
}

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Wei as a short ETH figure: at most six decimals, trailing zeros dropped. */
export function formatEth(wei: string | bigint): string {
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/** A whole number with thousands separators. */
export function formatCount(value: string | number | bigint): string {
  return BigInt(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export async function gatherFacts(api: MineraApi): Promise<Facts> {
  const [network, rigs] = await Promise.all([api.get('/v1/network'), api.get('/v1/rigs', { sort: 'epoch', limit: 3 })]);
  const n = object(network);
  const counts = object(n['rigs']);
  const day = object(n['last24h']);
  const jobs = object(day['jobsCompleted']);
  const pool = object(n['pool']);
  const campaign = object(n['campaign']);
  const epoch = object(n['epoch']);
  const top = (object(rigs)['rigs'] as unknown[] | undefined) ?? [];
  return {
    network: String(n['network'] ?? 'unknown'),
    chainId: Number(n['chainId'] ?? 0),
    rigsTotal: Number(counts['total'] ?? 0),
    rigsOnline: Number(counts['online'] ?? 0),
    verifiedUnits24h: String(day['verifiedUnits'] ?? '0'),
    answers24h: Number(jobs['chat'] ?? 0),
    poolBurned: String(pool['totalBurned'] ?? '0'),
    poolCommitted: String(pool['committed'] ?? '0'),
    campaignBurns: Number(campaign['burns'] ?? 0),
    epoch: Number(epoch['index'] ?? 0),
    topRigs: top
      .map(object)
      .filter((rig) => String(object(rig['verifiedUnits'])['epoch'] ?? '0') !== '0')
      .map((rig) => String(rig['name'] ?? ''))
      .filter((name) => name.length > 0),
    asOf: String(object(pool['asOf'])['time'] ?? ''),
  };
}
