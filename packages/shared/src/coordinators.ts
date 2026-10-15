/**
 * The project's coordinator on each network.
 *
 * A node client uses it when no URL was passed or saved, and replaces a saved URL the project has
 * retired with it, so a node set up before a move keeps working. A URL passed on the command line
 * always wins.
 */

import type { NetworkKey } from './chain.ts';

export interface CoordinatorInfo {
  /** The address the project serves this network's coordinator at. */
  readonly url: string;
  /** Addresses this network's coordinator used to answer at. */
  readonly retired: readonly string[];
}

export const COORDINATORS: Readonly<Record<NetworkKey, CoordinatorInfo>> = {
  testnet: {
    url: 'https://testnet-api.mineragpu.tech',
    retired: ['https://api.mineragpu.tech', 'https://coordinator-production-cf00.up.railway.app'],
  },
  mainnet: {
    url: 'https://api.mineragpu.tech',
    retired: ['https://coordinator-mainnet-production.up.railway.app'],
  },
};

export type CoordinatorSource = 'flag' | 'saved' | 'default' | 'moved';

export interface ResolvedCoordinator {
  url: string;
  source: CoordinatorSource;
}

/** Compares URLs without regard to case or a trailing slash. */
function sameUrl(a: string, b: string): boolean {
  const clean = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();
  return clean(a) === clean(b);
}

/**
 * The coordinator a node should use on `network`: the URL passed on the command line, else the
 * saved one, else the project's. A saved URL the project has retired is replaced (`moved`).
 */
export function resolveCoordinator(
  network: NetworkKey,
  passed: string | null | undefined,
  saved: string | null | undefined,
): ResolvedCoordinator {
  const info = COORDINATORS[network];
  if (passed) return { url: passed, source: 'flag' };
  if (saved && info.retired.some((old) => sameUrl(old, saved))) return { url: info.url, source: 'moved' };
  if (saved) return { url: saved, source: 'saved' };
  return { url: info.url, source: 'default' };
}
