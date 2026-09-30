import type {
  Address,
  Hex,
  JobKind,
  RigStanding,
  RuntimeInfo,
  SentinelGate,
  SentinelGateStats,
} from '@minera/shared';
import type { Random } from '../random.ts';
import type {
  BurnRecord,
  CampaignSummary,
  CanaryRecord,
  ClaimRecord,
  DeployedRig,
  Entitlement,
  HourlyUnits,
  JobOrigin,
  JobRecord,
  JobResult,
  NewCanary,
  NewJob,
  NodeReport,
  PublishedSettlement,
  RigListPage,
  RigListQuery,
  RigRecord,
  RigWork,
  SentinelState,
  SettlementDraft,
  SettlementRecord,
  StrikeReason,
  Verification,
  WorkCredit,
} from './records.ts';

export interface RigStore {
  get(nodeKey: Address): Promise<RigRecord | null>;
  /** Record a deployment seen on the registry. Replaying the same event changes nothing. */
  deploy(rig: DeployedRig): Promise<void>;
  setPair(nodeKey: Address, pair: Address): Promise<void>;
  retire(nodeKey: Address, at: Date): Promise<void>;
  recordHello(nodeKey: Address, report: NodeReport, now: Date): Promise<void>;
  recordHeartbeat(nodeKey: Address, runtime: RuntimeInfo, network: string | null, now: Date): Promise<void>;
  updateSentinel(nodeKey: Address, patch: Partial<SentinelState>): Promise<void>;
  /** Deployed, unretired rigs per standing. */
  standingCounts(): Promise<Record<RigStanding, number>>;
  /**
   * Count a known-answer or cross-check outcome. A pass qualifies the rig for open jobs; a failure
   * withdraws that until the rig passes again.
   */
  recordCheck(nodeKey: Address, passed: boolean, now: Date): Promise<void>;
  markChallenged(nodeKey: Address, now: Date): Promise<void>;
  list(query: RigListQuery): Promise<RigListPage>;
  counts(onlineSince: Date): Promise<{ total: number; online: number }>;
}

export interface NonceStore {
  /** Resolves `false` when the nonce was already used by this node key. */
  use(nodeKey: Address, nonce: string, expiresAt: Date): Promise<boolean>;
  prune(now: Date): Promise<number>;
}

export interface AssignableQuery {
  rig: RigRecord;
  /** Whether the rig may take open jobs, or only checks addressed to it. */
  qualified: boolean;
  now: Date;
  limit: number;
}

export interface JobStore {
  insert(job: NewJob): Promise<void>;
  get(id: string): Promise<JobRecord | null>;
  group(groupId: string): Promise<JobRecord[]>;
  /**
   * Queued jobs this rig may take: a model it serves and not expired. A job is never offered to a
   * rig that shares an operator, a network or a card with a rig holding another job of its group,
   * nor to a rig on the network its playground prompt came from.
   */
  assignable(query: AssignableQuery): Promise<JobRecord[]>;
  inFlight(nodeKey: Address): Promise<number>;
  /** Checks and canaries addressed to the rig that are still queued or assigned. */
  openChecks(nodeKey: Address): Promise<JobRecord[]>;
  queuedCount(kind: JobKind): Promise<number>;
  /** Jobs of this origin still queued or assigned. */
  openCount(origin: JobOrigin): Promise<number>;
  assign(id: string, nodeKey: Address, at: Date, deadline: Date): Promise<void>;
  /** Put an assigned job back on the queue after its deadline passed. */
  release(id: string): Promise<void>;
  close(id: string, status: 'expired' | 'cancelled', at: Date): Promise<void>;
  /** Move a queued job's expiry earlier; a later time than the current expiry is ignored. */
  expireBy(id: string, at: Date): Promise<void>;
  complete(id: string, result: JobResult): Promise<void>;
  setVerification(id: string, verification: Verification, at: Date | null): Promise<void>;
  overdue(now: Date): Promise<JobRecord[]>;
  stale(now: Date): Promise<JobRecord[]>;
  /** Jobs finished since the given time, per kind. */
  completedSince(since: Date): Promise<Record<JobKind, number>>;
  /** Verified units of playground prompts, the only work that pays, since the given time. */
  verifiedUnitsSince(since: Date): Promise<bigint>;
  hourlyVerifiedUnits(nodeKey: Address, since: Date): Promise<HourlyUnits[]>;
}

export interface WorkStore {
  /** Add units to a rig's epoch; verified units also grow the rig's lifetime total. */
  credit(nodeKey: Address, epoch: number, units: WorkCredit): Promise<void>;
  epochUnits(nodeKey: Address, epoch: number): Promise<bigint>;
  /**
   * Verified and paid units per rig, with its operator, over an inclusive epoch range. Epochs in
   * which a rig was quarantined pay nothing.
   */
  verifiedByRig(fromEpoch: number, toEpoch: number): Promise<RigWork[]>;
}

export type TallyOutcome = 'passed' | 'blocked';

export interface SentinelStore {
  /** Count one gate decision toward the public tally. */
  tally(gate: SentinelGate, outcome: TallyOutcome, at: Date): Promise<void>;
  /** Decisions per gate since the given time, one entry per gate in gate order. */
  gateCounts(since: Date): Promise<SentinelGateStats[]>;
  strike(nodeKey: Address, reason: StrikeReason, at: Date): Promise<void>;
  strikesSince(nodeKey: Address, since: Date): Promise<number>;
  /** Record epochs in which the rig was quarantined. Replaying an epoch changes nothing. */
  quarantine(nodeKey: Address, epochs: readonly number[]): Promise<void>;
  addCanary(canary: NewCanary): Promise<void>;
  getCanary(id: string): Promise<CanaryRecord | null>;
  /** A random canary of this model that the rig never saw and was never sent. */
  pickCanary(model: string, nodeKey: Address, random: Random): Promise<CanaryRecord | null>;
  markServed(id: string, nodeKey: Address): Promise<void>;
  confirm(id: string): Promise<void>;
  dispute(id: string): Promise<void>;
  retire(id: string): Promise<void>;
  canaryCount(model: string): Promise<number>;
  /** Drop tallies and strikes older than `before`, and the oldest canaries past `bankSize` per model. */
  prune(before: Date, bankSize: number): Promise<void>;
}

export interface SettlementStore {
  /** Store a settlement and its entitlements before its transaction is sent. */
  createDraft(draft: SettlementDraft): Promise<number>;
  /** Only a draft still being sent changes. */
  markSent(id: number, txHash: Hex): Promise<void>;
  /** Only an open draft changes, so a settlement already seen on-chain is never downgraded. */
  markFailed(id: number, error: string): Promise<void>;
  /**
   * Record a settlement seen on-chain: matched by index, then by root among unconfirmed drafts,
   * otherwise stored without inputs.
   */
  recordPublished(published: PublishedSettlement): Promise<void>;
  markVetoed(index: number): Promise<void>;
  /** Drafts whose transaction has not been confirmed or refused yet. */
  open(): Promise<SettlementRecord[]>;
  byIndex(index: number): Promise<SettlementRecord | null>;
  recent(limit: number): Promise<SettlementRecord[]>;
  entitlements(settlementId: number): Promise<Entitlement[]>;
  entitlement(settlementId: number, account: Address): Promise<Entitlement | null>;
  /** The newest published, not vetoed settlement that is claimable at `now`. */
  latestClaimable(now: Date): Promise<SettlementRecord | null>;
  /** The newest published, not vetoed settlement still inside its challenge delay at `now`. */
  latestPending(now: Date): Promise<SettlementRecord | null>;
}

export interface ChainStore {
  cursor(): Promise<bigint | null>;
  setCursor(block: bigint): Promise<void>;
  addBurn(burn: BurnRecord): Promise<void>;
  addClaim(claim: ClaimRecord): Promise<void>;
  recentBurns(limit: number): Promise<BurnRecord[]>;
  /** The campaign of the newest burn that names one. */
  currentCampaign(): Promise<CampaignSummary | null>;
  claimedBy(account: Address): Promise<bigint>;
}

export interface Store {
  rigs: RigStore;
  nonces: NonceStore;
  jobs: JobStore;
  work: WorkStore;
  settlements: SettlementStore;
  chain: ChainStore;
  sentinel: SentinelStore;
  /**
   * Run `work` atomically. Write transactions are serialized, so job placement and verification
   * never race; the coordinator's write rate is low enough for that to cost nothing.
   */
  transaction<T>(work: (store: Store) => Promise<T>): Promise<T>;
}
