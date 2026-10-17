import type { FastifyInstance } from 'fastify';
import type { Address } from '@minera/shared';
import { epochOf, epochStart } from '../epoch.ts';
import { SENTINEL_POLICY } from '../sentinel/policy.ts';
import type { SettlementRecord } from '../store/records.ts';
import type { RouteContext } from './context.ts';
import { iso } from './format.ts';

const RECENT = 20;
const EARNERS = 25;

interface RewardSettlement {
  index: number;
  /** What this settlement added to the total committed to miners, in wei. */
  added: string;
  /** Everything committed to miners as of this settlement, in wei. */
  total: string;
  vetoed: boolean;
  txHash: string | null;
  publishedAt: string | null;
  claimableAt: string | null;
}

interface RewardEarner {
  account: Address;
  /** Earned so far, as of the newest published settlement, in wei. */
  earned: string;
  claimed: string;
  /** What the account can claim now, from the newest claimable settlement, in wei. */
  claimable: string;
}

interface RewardsView {
  totals: {
    /** Committed to miners by the newest published settlement, as the pool reports it. */
    committed: string;
    claimed: string;
    /** Committed but not claimed yet. */
    unclaimed: string;
    /** Deposited and not committed yet: what later settlements can still release. */
    inPool: string;
    accounts: number;
    settlements: number;
  } | null;
  /** The newest settlement still inside its challenge delay. */
  pending: { index: number; claimableAt: string } | null;
  /** When the current epoch ends; the next settlement is built after an epoch ends. */
  epochEndsAt: string;
  settlements: RewardSettlement[];
  earners: RewardEarner[];
  rules: {
    maxWeiPerUnit: string;
    perOriginUnits: number;
    perPairUnits: number;
    probationPayBps: number;
    releaseBpsPerDay: string | null;
    challengeDelaySeconds: string | null;
    epochSeconds: number;
  };
}

const published = (settlement: SettlementRecord): settlement is SettlementRecord & { index: number } =>
  settlement.index !== null;

/** Everything about the rewards in one place: totals, who earned what, the settlements and the rules. */
export function registerRewardsRoute(app: FastifyInstance, context: RouteContext): void {
  const { store, pool, config, clock } = context;

  app.get('/v1/rewards', async (): Promise<RewardsView> => {
    const now = clock();
    const [recent, claimable, totalClaimed] = await Promise.all([
      store.settlements.recent(RECENT + 1),
      store.settlements.latestClaimable(now),
      store.chain.totalClaimed(),
    ]);
    const chain = recent.filter(published);
    const head = chain.find((settlement) => !settlement.vetoed) ?? null;

    const settlements = chain.slice(0, RECENT).map((settlement, i): RewardSettlement => {
      const previous = chain.slice(i + 1).find((older) => !older.vetoed);
      const added = settlement.vetoed ? 0n : settlement.total - (previous?.total ?? 0n);
      return {
        index: settlement.index,
        added: (added > 0n ? added : 0n).toString(),
        total: settlement.total.toString(),
        vetoed: settlement.vetoed,
        txHash: settlement.txHash,
        publishedAt: iso(settlement.publishedAt),
        claimableAt: iso(settlement.claimableAt),
      };
    });

    const [earned, claimableNow] = await Promise.all([
      head ? store.settlements.entitlements(head.id) : Promise.resolve([]),
      claimable ? store.settlements.entitlements(claimable.id) : Promise.resolve([]),
    ]);
    const claimableBy = new Map(claimableNow.map((entry) => [entry.account, entry.cumulative]));
    const top = [...earned].sort((a, b) => (a.cumulative < b.cumulative ? 1 : a.cumulative > b.cumulative ? -1 : 0)).slice(0, EARNERS);
    const earners = await Promise.all(
      top.map(async (entry): Promise<RewardEarner> => {
        const claimed = await store.chain.claimedBy(entry.account);
        const ready = (claimableBy.get(entry.account) ?? 0n) - claimed;
        return {
          account: entry.account,
          earned: entry.cumulative.toString(),
          claimed: claimed.toString(),
          claimable: (ready > 0n ? ready : 0n).toString(),
        };
      }),
    );

    const snapshot = pool.current();
    const committed = snapshot?.committed ?? head?.total ?? 0n;
    const latest = snapshot?.latest;
    return {
      totals: snapshot
        ? {
            committed: committed.toString(),
            claimed: totalClaimed.toString(),
            unclaimed: (committed > totalClaimed ? committed - totalClaimed : 0n).toString(),
            inPool: (snapshot.totalBurned - committed).toString(),
            accounts: earned.length,
            settlements: snapshot.settlementCount,
          }
        : null,
      pending:
        latest && !latest.vetoed && snapshot && latest.claimableAt > snapshot.timestamp
          ? { index: latest.index, claimableAt: new Date(Number(latest.claimableAt) * 1000).toISOString() }
          : null,
      epochEndsAt: epochStart(epochOf(now, config.epochSeconds) + 1, config.epochSeconds).toISOString(),
      settlements,
      earners,
      rules: {
        maxWeiPerUnit: config.rewardMaxWeiPerUnit,
        perOriginUnits: config.workLimits.perOrigin,
        perPairUnits: config.workLimits.perPair,
        probationPayBps: SENTINEL_POLICY.probationPayBps,
        releaseBpsPerDay: snapshot?.releaseBpsPerDay.toString() ?? null,
        challengeDelaySeconds: snapshot?.challengeDelay.toString() ?? null,
        epochSeconds: config.epochSeconds,
      },
    };
  });
}
