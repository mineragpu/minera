import type { FastifyInstance } from 'fastify';
import type { RouteContext } from './context.ts';
import {
  burnSummary,
  campaignView,
  poolSummary,
  settlementSummary,
  unixIso,
  type BurnSummary,
  type CampaignView,
  type PoolSummary,
  type SettlementSummary,
} from './format.ts';

const RECENT = 20;

interface PoolState extends PoolSummary {
  releaseBpsPerDay: string;
  challengeDelaySeconds: string;
  deployedAt: string;
  settlementCount: number;
  head: number | null;
  /** The newest settlement while it is still inside its challenge delay. */
  pending: { index: number; claimableAt: string } | null;
}

interface PoolResponse {
  state: PoolState | null;
  campaign: CampaignView | null;
  burns: BurnSummary[];
  settlements: SettlementSummary[];
}

export function registerPoolRoute(app: FastifyInstance, context: RouteContext): void {
  const { store, pool } = context;

  app.get('/v1/pool', async (): Promise<PoolResponse> => {
    const [burns, settlements, campaign] = await Promise.all([
      store.chain.recentBurns(RECENT),
      store.settlements.recent(RECENT),
      store.chain.currentCampaign(),
    ]);
    const snapshot = pool.current();
    const latest = snapshot?.latest;
    return {
      state: snapshot
        ? {
            ...poolSummary(snapshot),
            releaseBpsPerDay: snapshot.releaseBpsPerDay.toString(),
            challengeDelaySeconds: snapshot.challengeDelay.toString(),
            deployedAt: unixIso(snapshot.deployedAt),
            settlementCount: snapshot.settlementCount,
            head: snapshot.head?.index ?? null,
            pending:
              latest && !latest.vetoed && latest.claimableAt > snapshot.timestamp
                ? { index: latest.index, claimableAt: unixIso(latest.claimableAt) }
                : null,
          }
        : null,
      campaign: campaign ? campaignView(campaign) : null,
      burns: burns.map(burnSummary),
      settlements: settlements.map(settlementSummary),
    };
  });
}
