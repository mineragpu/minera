/** One typed fetcher per public coordinator route the site uses. */

import { SENTINEL_ROUTE, type Address } from '@minera/shared';
import { requestJson } from './client.ts';
import {
  claimView,
  networkView,
  playgroundJob,
  playgroundReceipt,
  poolView,
  rigBoard,
  rigDetail,
  sentinelView,
  type ClaimView,
  type NetworkView,
  type PlaygroundJob,
  type PlaygroundReceipt,
  type PoolView,
  type RigBoard,
  type RigDetail,
  type SentinelView,
} from './schemas.ts';

/** The coordinator's board orders: newest first, lifetime verified units, or this epoch's. */
export type RigSort = 'new' | 'top' | 'epoch';

export interface RigQuery {
  sort: RigSort;
  /** `eth`, a listed token's address, or null for every pair. */
  pair: 'eth' | Address | null;
  /** Only the rigs this wallet operates; every operator when left out. */
  operator?: Address;
  /** At most 100, the coordinator's cap. */
  limit: number;
  offset: number;
}

export function fetchNetwork(signal: AbortSignal): Promise<NetworkView> {
  return requestJson('/v1/network', networkView, { signal });
}

export function fetchRigs(query: RigQuery, signal: AbortSignal): Promise<RigBoard> {
  const params = new URLSearchParams({ sort: query.sort, limit: String(query.limit), offset: String(query.offset) });
  if (query.pair !== null) params.set('pair', query.pair);
  if (query.operator !== undefined) params.set('operator', query.operator);
  return requestJson(`/v1/rigs?${params.toString()}`, rigBoard, { signal });
}

export function fetchRig(nodeKey: Address, signal: AbortSignal): Promise<RigDetail> {
  return requestJson(`/v1/rigs/${nodeKey}`, rigDetail, { signal });
}

export function fetchPool(signal: AbortSignal): Promise<PoolView> {
  return requestJson('/v1/pool', poolView, { signal });
}

export function fetchClaims(account: Address, signal: AbortSignal): Promise<ClaimView> {
  return requestJson(`/v1/claims/${account}`, claimView, { signal });
}

export function fetchSentinel(signal: AbortSignal): Promise<SentinelView> {
  return requestJson(SENTINEL_ROUTE, sentinelView, { signal });
}

export function submitPrompt(prompt: string): Promise<PlaygroundReceipt> {
  return requestJson('/v1/playground/jobs', playgroundReceipt, { method: 'POST', body: { prompt } });
}

export function fetchPlaygroundJob(id: string, signal: AbortSignal): Promise<PlaygroundJob> {
  return requestJson(`/v1/playground/jobs/${encodeURIComponent(id)}`, playgroundJob, { signal });
}
