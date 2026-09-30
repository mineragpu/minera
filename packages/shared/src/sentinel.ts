/**
 * Sentinel, the coordinator's defense against bots, scripts, fake GPUs, sybil rigs and collusion.
 * Every rig meets the same five gates, in this order, before its work can earn.
 */
export const SENTINEL_GATES = ['identity', 'gpu', 'canary', 'crosscheck', 'reputation'] as const;

export type SentinelGate = (typeof SENTINEL_GATES)[number];

/**
 * - `probation`: a new rig, or one back from quarantine. Its verified work earns at half rate.
 * - `trusted`: passed enough canaries with no recent strikes. Earns at the full rate.
 * - `quarantined`: struck out. It gets no work, and its work in the epoch earns nothing.
 */
export type RigStanding = 'probation' | 'trusted' | 'quarantined';

export interface SentinelGateStats {
  gate: SentinelGate;
  /** Decisions that let a rig or its work through. */
  passed: number;
  /** Decisions that stopped a request, a result or a rig. */
  blocked: number;
}

/** What `GET /v1/sentinel` returns. */
export interface SentinelStats {
  /** ISO time of the snapshot. Gate counts cover the 24 hours before it. */
  asOf: string;
  /** One entry per gate, in `SENTINEL_GATES` order. */
  gates: SentinelGateStats[];
  /** Deployed, unretired rigs by standing, now. */
  standing: Record<RigStanding, number>;
}

export const SENTINEL_ROUTE = '/v1/sentinel';
