/**
 * Renting a GPU machine from the Deploy page: a quote in ETH, a payment whose data is the rental's
 * id, a machine launched for the renter that pairs with the page, and a refund of whatever the
 * renter did not get.
 */

import type { Hex } from './protocol.ts';
import type { Address } from './rewards.ts';

export const RENTAL_ROUTES = {
  offer: '/v1/rentals/offer',
  create: '/v1/rentals',
  list: (operator: Address) => `/v1/rentals?operator=${encodeURIComponent(operator)}`,
  view: (id: string) => `/v1/rentals/${encodeURIComponent(id)}`,
  payment: (id: string) => `/v1/rentals/${encodeURIComponent(id)}/payment`,
} as const;

/** The packages on offer, in rental units: days on mainnet. */
export const RENTAL_PACKAGES = [1, 7, 30] as const;

/** 128 random bits as 32 lowercase hexadecimal characters; also the payment's data. */
export const RENTAL_ID_PATTERN = /^[0-9a-f]{32}$/;

export type RentalStatusView =
  | 'quoted'
  | 'expired'
  | 'paid'
  | 'starting'
  | 'running'
  | 'ended'
  | 'failed'
  | 'applied';

/** `GET /v1/rentals/offer`: what a rental costs right now. */
export interface RentalOfferView {
  /** A machine within the price cap is on offer, and there is room for another rental. */
  available: boolean;
  /** Why not, when not available. */
  reason: string | null;
  gpu: { model: string; vramMb: number } | null;
  /** Seconds in one rental unit: 86400, a day, except on a test network. */
  unitSeconds: number;
  packages: { units: number; usd: string; wei: string }[];
  /** US dollars per ETH the prices were converted at. */
  ethUsd: string;
  payTo: Address;
  quoteSeconds: number;
}

/** `POST /v1/rentals` body. */
export interface CreateRentalRequest {
  operator: Address;
  units: number;
  /** Set to extend a rental by `units`. */
  parentId?: string;
}

export interface RentalRefundView {
  wei: string;
  reason: 'excess' | 'late' | 'short' | 'unused';
  status: 'pending' | 'sent' | 'done';
  txHash: Hex | null;
}

/** A rental as the Deploy page sees it. */
export interface RentalView {
  id: string;
  parentId: string | null;
  operator: Address;
  units: number;
  unitSeconds: number;
  priceWei: string;
  usd: string;
  status: RentalStatusView;
  /** Where and what to pay, while the quote is open. */
  payment: { to: Address; value: string; data: Hex; expiresAt: string } | null;
  payTx: Hex | null;
  paidAt: string | null;
  gpu: string | null;
  /** The code the rented machine pairs with the Deploy page under, once it is launched. */
  pairingCode: string | null;
  startedAt: string | null;
  endsAt: string | null;
  note: string | null;
  createdAt: string;
  refunds: RentalRefundView[];
}
