/**
 * The coordinator's public responses, field for field. Amounts and unit counts arrive as decimal
 * strings and are decoded to bigint; timestamps arrive as ISO strings and are decoded to Date.
 */

import { SENTINEL_GATES } from '@minera/shared';
import {
  address,
  array,
  bigintString,
  boolean,
  hex,
  integer,
  literal,
  nullable,
  object,
  record,
  string,
  timestamp,
  type Decoded,
} from './decode.ts';

const poolSummaryShape = {
  totalBurned: bigintString,
  committed: bigintString,
  releasable: bigintString,
  asOf: object({ block: bigintString, time: timestamp }),
};

const campaign = object({
  id: bigintString,
  memo: nullable(string),
  burned: bigintString,
  burns: integer,
  firstBurnAt: timestamp,
  lastBurnAt: timestamp,
});

export const networkView = object({
  network: string,
  chainId: integer,
  rigs: object({ online: integer, total: integer }),
  last24h: object({ verifiedUnits: bigintString, jobsCompleted: record(integer) }),
  pool: nullable(object(poolSummaryShape)),
  campaign: nullable(campaign),
  epoch: object({ index: integer, seconds: integer, startedAt: timestamp, endsAt: timestamp }),
  rules: object({ units: string, verification: string }),
});

const rigSummaryShape = {
  nodeKey: address,
  name: string,
  operator: address,
  pair: address,
  deployedAt: timestamp,
  online: boolean,
  lastSeenAt: nullable(timestamp),
  models: array(string),
  verifiedUnits: object({ epoch: bigintString, lifetime: bigintString }),
  checks: object({ passed: integer, failed: integer }),
};

export const rigBoard = object({
  total: integer,
  limit: integer,
  offset: integer,
  epoch: integer,
  rigs: array(object(rigSummaryShape)),
});

export const rigDetail = object({
  ...rigSummaryShape,
  retired: boolean,
  retiredAt: nullable(timestamp),
  deployedBlock: bigintString,
  hourly: array(object({ hour: timestamp, verifiedUnits: bigintString })),
});

export const poolView = object({
  state: nullable(
    object({
      ...poolSummaryShape,
      releaseBpsPerDay: bigintString,
      challengeDelaySeconds: bigintString,
      deployedAt: timestamp,
      settlementCount: integer,
      head: nullable(integer),
      pending: nullable(object({ index: integer, claimableAt: timestamp })),
    }),
  ),
  campaign: nullable(campaign),
  burns: array(
    object({
      txHash: hex,
      block: bigintString,
      time: timestamp,
      from: address,
      amount: bigintString,
      campaignId: bigintString,
      memo: nullable(string),
    }),
  ),
  settlements: array(
    object({
      index: nullable(integer),
      root: hex,
      total: bigintString,
      vetoed: boolean,
      txHash: nullable(hex),
      block: nullable(bigintString),
      publishedAt: nullable(timestamp),
      claimableAt: nullable(timestamp),
      epochs: nullable(object({ from: integer, to: integer })),
    }),
  ),
});

export const claimView = object({
  account: address,
  cumulative: bigintString,
  claimed: bigintString,
  claimable: bigintString,
  settlement: nullable(object({ index: integer, root: hex, claimableAt: nullable(timestamp) })),
  proof: array(hex),
  pending: nullable(object({ index: integer, cumulative: bigintString, claimableAt: nullable(timestamp) })),
});

/** A GPU machine paired with the Deploy page under the page's one-time code. */
export const pairingView = object({
  code: string,
  nodeAddress: address,
  operator: address,
  deployCode: hex,
  gpu: nullable(object({ model: string, vramMb: integer })),
  clientVersion: string,
  pairedAt: timestamp,
  expiresAt: timestamp,
});

/** What a rented machine costs right now, per package. */
export const rentalOffer = object({
  available: boolean,
  reason: nullable(string),
  gpu: nullable(object({ model: string, vramMb: integer })),
  unitSeconds: integer,
  packages: array(object({ units: integer, usd: string, wei: bigintString })),
  ethUsd: string,
  payTo: address,
  quoteSeconds: integer,
});

export const rentalView = object({
  id: string,
  parentId: nullable(string),
  operator: address,
  units: integer,
  unitSeconds: integer,
  priceWei: bigintString,
  usd: string,
  status: literal('quoted', 'expired', 'paid', 'starting', 'running', 'ended', 'failed', 'applied'),
  payment: nullable(object({ to: address, value: bigintString, data: hex, expiresAt: timestamp })),
  payTx: nullable(hex),
  paidAt: nullable(timestamp),
  gpu: nullable(string),
  pairingCode: nullable(string),
  startedAt: nullable(timestamp),
  endsAt: nullable(timestamp),
  note: nullable(string),
  createdAt: timestamp,
  refunds: array(
    object({
      wei: bigintString,
      reason: literal('excess', 'late', 'short', 'unused'),
      status: literal('pending', 'sent', 'done'),
      txHash: nullable(hex),
    }),
  ),
});

export const rentalList = object({ rentals: array(rentalView) });

export const rewardsView = object({
  totals: nullable(
    object({
      committed: bigintString,
      claimed: bigintString,
      unclaimed: bigintString,
      inPool: bigintString,
      accounts: integer,
      settlements: integer,
    }),
  ),
  pending: nullable(object({ index: integer, claimableAt: timestamp })),
  epochEndsAt: timestamp,
  settlements: array(
    object({
      index: integer,
      added: bigintString,
      total: bigintString,
      vetoed: boolean,
      txHash: nullable(hex),
      publishedAt: nullable(timestamp),
      claimableAt: nullable(timestamp),
    }),
  ),
  earners: array(object({ account: address, earned: bigintString, claimed: bigintString, claimable: bigintString })),
  rules: object({
    maxWeiPerUnit: bigintString,
    perOriginUnits: integer,
    perPairUnits: integer,
    probationPayBps: integer,
    releaseBpsPerDay: nullable(bigintString),
    challengeDelaySeconds: nullable(bigintString),
    epochSeconds: integer,
  }),
});

export const playgroundReceipt = object({ id: string, status: literal('queued') });

export const playgroundJob = object({
  id: string,
  status: literal('queued', 'running', 'checking', 'done', 'expired'),
  prompt: string,
  output: nullable(string),
  rig: nullable(object({ nodeKey: address, name: string })),
  crossChecked: boolean,
  verification: literal('pending', 'verified', 'unverified', 'mismatch'),
  createdAt: timestamp,
  finishedAt: nullable(timestamp),
  rule: string,
});

/** The last 24 hours at each Sentinel gate, and every deployed rig by its standing now. */
export const sentinelView = object({
  asOf: timestamp,
  gates: array(object({ gate: literal(...SENTINEL_GATES), passed: integer, blocked: integer })),
  standing: object({ probation: integer, trusted: integer, quarantined: integer }),
});

export type NetworkView = Decoded<typeof networkView>;
export type RigBoard = Decoded<typeof rigBoard>;
export type RigSummary = RigBoard['rigs'][number];
export type RigDetail = Decoded<typeof rigDetail>;
export type PoolView = Decoded<typeof poolView>;
export type ClaimView = Decoded<typeof claimView>;
export type RewardsView = Decoded<typeof rewardsView>;
export type PairingView = Decoded<typeof pairingView>;
export type RentalOffer = Decoded<typeof rentalOffer>;
export type RentalView = Decoded<typeof rentalView>;
export type PlaygroundReceipt = Decoded<typeof playgroundReceipt>;
export type PlaygroundJob = Decoded<typeof playgroundJob>;
export type PlaygroundStatus = PlaygroundJob['status'];
export type SentinelView = Decoded<typeof sentinelView>;
