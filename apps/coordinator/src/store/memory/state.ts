import type { Address } from '@dayagpu/shared';
import type {
  BurnRecord,
  ClaimRecord,
  Entitlement,
  JobRecord,
  RigRecord,
  SettlementRecord,
} from '../records.ts';

export interface WorkRow {
  nodeKey: Address;
  epoch: number;
  verified: bigint;
  unverified: bigint;
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
  };
}

/** Records leave the store as copies, as they would from a database. */
export function copy<T>(value: T): T {
  return structuredClone(value);
}

export function descending(a: bigint, b: bigint): number {
  return a > b ? -1 : a < b ? 1 : 0;
}
