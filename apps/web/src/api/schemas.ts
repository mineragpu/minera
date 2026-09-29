/**
 * The coordinator's public responses, field for field. Amounts and unit counts arrive as decimal
 * strings and are decoded to bigint; timestamps arrive as ISO strings and are decoded to Date.
 */

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

export type NetworkView = Decoded<typeof networkView>;
export type RigBoard = Decoded<typeof rigBoard>;
export type RigSummary = RigBoard['rigs'][number];
export type RigDetail = Decoded<typeof rigDetail>;
export type PoolView = Decoded<typeof poolView>;
export type ClaimView = Decoded<typeof claimView>;
export type PlaygroundReceipt = Decoded<typeof playgroundReceipt>;
export type PlaygroundJob = Decoded<typeof playgroundJob>;
export type PlaygroundStatus = PlaygroundJob['status'];
