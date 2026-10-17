/** One typed fetcher per public coordinator route the site uses. */

import { PAIRING_ROUTES, RENTAL_ROUTES, SENTINEL_ROUTE, type Address, type Hex } from '@minera/shared';
import { requestJson } from './client.ts';
import {
  claimView,
  networkView,
  pairingView,
  rentalList,
  rentalOffer,
  rentalView,
  playgroundJob,
  playgroundReceipt,
  poolView,
  rewardsView,
  rigBoard,
  rigDetail,
  sentinelView,
  type ClaimView,
  type NetworkView,
  type PairingView,
  type RentalOffer,
  type RentalView,
  type PlaygroundJob,
  type PlaygroundReceipt,
  type PoolView,
  type RewardsView,
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

export function fetchRewards(signal: AbortSignal): Promise<RewardsView> {
  return requestJson('/v1/rewards', rewardsView, { signal });
}

export function fetchClaims(account: Address, signal: AbortSignal): Promise<ClaimView> {
  return requestJson(`/v1/claims/${account}`, claimView, { signal });
}

/** The machine paired under this code; a 404 means none has paired yet. */
export function fetchPairing(code: string, signal: AbortSignal): Promise<PairingView> {
  return requestJson(PAIRING_ROUTES.view(code), pairingView, { signal });
}

/** A rented machine's price; `404 rentals_off` where the network does not rent machines. */
export function fetchRentalOffer(signal: AbortSignal): Promise<RentalOffer> {
  return requestJson(RENTAL_ROUTES.offer, rentalOffer, { signal });
}

/** A quote for `units` of rental, or for extending `parentId` by them. */
export function createRental(operator: Address, units: number, parentId?: string): Promise<RentalView> {
  const body = parentId === undefined ? { operator, units } : { operator, units, parentId };
  return requestJson(RENTAL_ROUTES.create, rentalView, { method: 'POST', body });
}

export function submitRentalPayment(id: string, txHash: Hex): Promise<RentalView> {
  return requestJson(RENTAL_ROUTES.payment(id), rentalView, { method: 'POST', body: { txHash } });
}

export function fetchRental(id: string, signal: AbortSignal): Promise<RentalView> {
  return requestJson(RENTAL_ROUTES.view(id), rentalView, { signal });
}

export async function fetchRentals(operator: Address, signal: AbortSignal): Promise<RentalView[]> {
  return (await requestJson(RENTAL_ROUTES.list(operator), rentalList, { signal })).rentals;
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
