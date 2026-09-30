import type { Address } from '@minera/shared';
import type {
  BurnRecord,
  CanaryRecord,
  ClaimRecord,
  Entitlement,
  JobRecord,
  RigRecord,
  SettlementRecord,
  StrikeReason,
} from '../records.ts';

export interface WorkRow {
  nodeKey: Address;
  epoch: number;
  verified: bigint;
  unverified: bigint;
  paid: bigint;
}

export interface StrikeRow {
  nodeKey: Address;
  reason: StrikeReason;
  at: Date;
}

export interface MemoryState {
  rigs: Map<Address, RigRecord>;
  nonces: Map<string, Date>;
  jobs: Map<string, JobRecord>;
  work: Map<string, WorkRow>;
  settlements: Map<number, SettlementRecord>;
  entitlements: Map<number, Entitlement[]>;
  burns: BurnRecord[];
  claims: ClaimRecord[];
  cursor: bigint | null;
  nextSettlementId: number;
  canaries: Map<string, CanaryRecord>;
  strikes: StrikeRow[];
  /** `nodeKey:epoch` of every quarantined epoch. */
  quarantines: Set<string>;
  /** Counts keyed by `minute|gate|outcome`, the minute in epoch milliseconds. */
  tally: Map<string, number>;
}

/** The state lives in a box so a failed transaction can swap it back for its snapshot. */
export interface StateBox {
  state: MemoryState;
}

export function emptyState(): MemoryState {
  return {
    rigs: new Map(),
    nonces: new Map(),
    jobs: new Map(),
    work: new Map(),
    settlements: new Map(),
    entitlements: new Map(),
    burns: [],
    claims: [],
    cursor: null,
    nextSettlementId: 1,
    canaries: new Map(),
    strikes: [],
    quarantines: new Set(),
    tally: new Map(),
  };
}

/** Records leave the store as copies, as they would from a database. */
export function copy<T>(value: T): T {
  return structuredClone(value);
}

export function descending(a: bigint, b: bigint): number {
  return a > b ? -1 : a < b ? 1 : 0;
}
