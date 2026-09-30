import type { Address, GpuInfo, Hex, JobAssignment, JobKind, RuntimeInfo, Settlement } from '@minera/shared';

export type ChatMessage = JobAssignment['messages'][number];
export type JobParams = JobAssignment['params'];

export type JobStatus = 'queued' | 'assigned' | 'done' | 'expired' | 'cancelled';

/**
 * - `pending`: no result yet, or waiting for the second rig's result.
 * - `verified`: matched by a second rig, or a known answer that checked out.
 * - `unverified`: nobody checked it. Recorded, but it earns nothing on its own.
 * - `mismatch`: two rigs disagreed. Neither earns.
 * - `failed`: a known-answer check came back wrong.
 */
export type Verification = 'pending' | 'verified' | 'unverified' | 'mismatch' | 'failed';

export interface DeployedRig {
  nodeKey: Address;
  operator: Address;
  pair: Address;
  name: string;
  deployedAt: Date;
  deployedBlock: bigint;
}

export interface RigRecord extends DeployedRig {
  retired: boolean;
  retiredAt: Date | null;
  gpu: GpuInfo | null;
  runtime: string | null;
  runtimeVersion: string | null;
  models: string[];
  clientVersion: string | null;
  helloAt: Date | null;
  lastSeenAt: Date | null;
  /** Last time the rig passed a known-answer check. */
  qualifiedAt: Date | null;
  lastChallengeAt: Date | null;
  checksPassed: number;
  checksFailed: number;
  /** Lifetime verified work units. */
  verifiedUnits: bigint;
}

export interface NodeReport {
  clientVersion: string;
  gpu: GpuInfo | null;
  runtime: RuntimeInfo;
}

export type RigSort = 'new' | 'top' | 'epoch';

export interface RigListQuery {
  sort: RigSort;
  pair: Address | null;
  /** Only rigs this wallet operates, or every operator when null. */
  operator: Address | null;
  /** The epoch whose units are reported alongside each rig. */
  epoch: number;
  limit: number;
  offset: number;
}

export interface RigListEntry extends RigRecord {
  epochUnits: bigint;
}

export interface RigListPage {
  total: number;
  rigs: RigListEntry[];
}

export interface JobRecord {
  id: string;
  /**
   * Jobs sent to two rigs for comparison share a group. For a playground prompt the group id is
   * the public id, and it differs from every job id a rig receives.
   */
  groupId: string;
  kind: JobKind;
  model: string;
  messages: ChatMessage[];
  params: JobParams;
  /** The known answer of a check. Never sent to a node. */
  expected: string | null;
  /** Checks go to one specific rig; open jobs have no target. */
  targetNode: Address | null;
  status: JobStatus;
  assignedNode: Address | null;
  assignedAt: Date | null;
  deadlineAt: Date | null;
  attempts: number;
  output: string | null;
  outputHash: Hex | null;
  /** Estimated tokens in the output, measured by the coordinator. */
  units: number | null;
  verification: Verification;
  createdAt: Date;
  /** A queued job nobody picked up by this time is dropped. */
  expiresAt: Date;
  finishedAt: Date | null;
  verifiedAt: Date | null;
}

export type NewJob = Pick<
  JobRecord,
  'id' | 'groupId' | 'kind' | 'model' | 'messages' | 'params' | 'expected' | 'targetNode' | 'createdAt' | 'expiresAt'
>;

export interface JobResult {
  output: string;
  outputHash: Hex;
  units: number;
  verification: Verification;
  finishedAt: Date;
  verifiedAt: Date | null;
}

export interface HourlyUnits {
  hour: Date;
  units: bigint;
}

export interface RigWork {
  nodeKey: Address;
  operator: Address;
  units: bigint;
}

export type SettlementStatus = 'sending' | 'sent' | 'published' | 'failed';

export type TreeDump = Settlement['dump'];

export interface Entitlement {
  account: Address;
  cumulative: bigint;
  proof: Hex[];
}

export interface SettlementDraft {
  root: Hex;
  total: bigint;
  inputsDigest: Hex;
  /** The canonical inputs document, byte for byte as hashed into `inputsDigest`. */
  inputs: string;
  dump: TreeDump;
  previousIndex: number;
  fromEpoch: number;
  toEpoch: number;
  entitlements: Entitlement[];
  createdAt: Date;
}

export interface SettlementRecord {
  id: number;
  /** The on-chain index, known once the publish transaction lands. */
  index: number | null;
  status: SettlementStatus;
  vetoed: boolean;
  root: Hex;
  total: bigint;
  inputsDigest: Hex | null;
  inputs: string | null;
  dump: TreeDump | null;
  previousIndex: number | null;
  fromEpoch: number | null;
  toEpoch: number | null;
  txHash: Hex | null;
  blockNumber: bigint | null;
  publishedAt: Date | null;
  claimableAt: Date | null;
  error: string | null;
  createdAt: Date;
}

export interface PublishedSettlement {
  index: number;
  root: Hex;
  total: bigint;
  inputsDigest: Hex;
  txHash: Hex;
  blockNumber: bigint;
  publishedAt: Date;
  claimableAt: Date;
}

export interface LogPosition {
  /** The block number as served by the RPC, never the in-contract `block.number`. */
  blockNumber: bigint;
  blockTime: Date;
  txHash: Hex;
  logIndex: number;
}

export interface BurnRecord extends LogPosition {
  from: Address;
  amount: bigint;
  campaignId: bigint;
  memo: Hex;
}

export interface ClaimRecord extends LogPosition {
  account: Address;
  index: number;
  amount: bigint;
  via: Address;
}

export interface CampaignSummary {
  campaignId: bigint;
  memo: Hex;
  burned: bigint;
  burns: number;
  firstBurnAt: Date;
  lastBurnAt: Date;
}
