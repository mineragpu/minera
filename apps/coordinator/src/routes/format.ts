import type { Address, Hex } from '@dayagpu/shared';
import type { PoolSnapshot } from '../chain/pool.ts';
import type { BurnRecord, CampaignSummary, RigRecord, SettlementRecord } from '../store/records.ts';

/** Public copy for how work is measured and when it counts. */
export const WORK_RULES = {
  units: 'Work units are estimated tokens: one per four characters of output, rounded up, measured by the coordinator.',
  verification:
    'Only verified work earns rewards. An answer is verified when a second rig returns the same output, or when a ' +
    'known-answer check passes. Answers nobody cross-checked are recorded as unverified and earn nothing on their own.',
} as const;

export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function unixIso(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

/** A burn memo as text when it holds printable text, otherwise `null`. */
function memoText(memo: Hex): string | null {
  const bytes = Buffer.from(memo.slice(2), 'hex');
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  if (end === 0) return null;
  const text = bytes.subarray(0, end).toString('utf8');
  return /^[\x20-\x7e]+$/.test(text) ? text : null;
}

export interface RigSummary {
  nodeKey: Address;
  name: string;
  operator: Address;
  pair: Address;
  deployedAt: string;
  online: boolean;
  lastSeenAt: string | null;
  models: string[];
  verifiedUnits: { epoch: string; lifetime: string };
  checks: { passed: number; failed: number };
}

export function rigSummary(rig: RigRecord, epochUnits: bigint, onlineSince: Date): RigSummary {
  return {
    nodeKey: rig.nodeKey,
    name: rig.name,
    operator: rig.operator,
    pair: rig.pair,
    deployedAt: rig.deployedAt.toISOString(),
    online: !rig.retired && rig.lastSeenAt !== null && rig.lastSeenAt >= onlineSince,
    lastSeenAt: iso(rig.lastSeenAt),
    models: rig.models,
    verifiedUnits: { epoch: epochUnits.toString(), lifetime: rig.verifiedUnits.toString() },
    checks: { passed: rig.checksPassed, failed: rig.checksFailed },
  };
}

export interface PoolSummary {
  totalBurned: string;
  committed: string;
  releasable: string;
  asOf: { block: string; time: string };
}

export function poolSummary(snapshot: PoolSnapshot): PoolSummary {
  return {
    totalBurned: snapshot.totalBurned.toString(),
    committed: snapshot.committed.toString(),
    releasable: snapshot.releasable.toString(),
    asOf: { block: snapshot.blockNumber.toString(), time: unixIso(snapshot.timestamp) },
  };
}

export interface BurnSummary {
  txHash: Hex;
  block: string;
  time: string;
  from: Address;
  amount: string;
  campaignId: string;
  memo: string | null;
}

export function burnSummary(burn: BurnRecord): BurnSummary {
  return {
    txHash: burn.txHash,
    block: burn.blockNumber.toString(),
    time: burn.blockTime.toISOString(),
    from: burn.from,
    amount: burn.amount.toString(),
    campaignId: burn.campaignId.toString(),
    memo: memoText(burn.memo),
  };
}

export interface SettlementSummary {
  index: number | null;
  root: Hex;
  total: string;
  vetoed: boolean;
  txHash: Hex | null;
  block: string | null;
  publishedAt: string | null;
  claimableAt: string | null;
  epochs: { from: number; to: number } | null;
}

export function settlementSummary(settlement: SettlementRecord): SettlementSummary {
  return {
    index: settlement.index,
    root: settlement.root,
    total: settlement.total.toString(),
    vetoed: settlement.vetoed,
    txHash: settlement.txHash,
    block: settlement.blockNumber?.toString() ?? null,
    publishedAt: iso(settlement.publishedAt),
    claimableAt: iso(settlement.claimableAt),
    epochs:
      settlement.fromEpoch !== null && settlement.toEpoch !== null
        ? { from: settlement.fromEpoch, to: settlement.toEpoch }
        : null,
  };
}

export interface CampaignView {
  id: string;
  memo: string | null;
  burned: string;
  burns: number;
  firstBurnAt: string;
  lastBurnAt: string;
}

export function campaignView(campaign: CampaignSummary): CampaignView {
  return {
    id: campaign.campaignId.toString(),
    memo: memoText(campaign.memo),
    burned: campaign.burned.toString(),
    burns: campaign.burns,
    firstBurnAt: campaign.firstBurnAt.toISOString(),
    lastBurnAt: campaign.lastBurnAt.toISOString(),
  };
}
