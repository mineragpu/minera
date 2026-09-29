import type { FastifyInstance } from 'fastify';
import type { JobKind } from '@dayagpu/shared';
import { epochOf, epochStart } from '../epoch.ts';
import { onlineSince, type RouteContext } from './context.ts';
import { campaignView, poolSummary, WORK_RULES, type CampaignView, type PoolSummary } from './format.ts';

const DAY_MS = 86_400_000;

interface NetworkView {
  network: string;
  chainId: number;
  rigs: { online: number; total: number };
  last24h: { verifiedUnits: string; jobsCompleted: Record<JobKind, number> };
  /** Read from the chain at `pool.asOf`; `null` until the first read succeeds. */
  pool: PoolSummary | null;
  campaign: CampaignView | null;
  epoch: { index: number; seconds: number; startedAt: string; endsAt: string };
  /** The model open jobs run on, so operators know which one to load before starting a rig. */
  jobs: { model: string; maxTokens: number };
  rules: typeof WORK_RULES;
}

export function registerNetworkRoute(app: FastifyInstance, context: RouteContext): void {
  const { store, config, pool, clock } = context;

  app.get('/v1/network', async (): Promise<NetworkView> => {
    const now = clock();
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const [rigs, verifiedUnits, jobsCompleted, campaign] = await Promise.all([
      store.rigs.counts(onlineSince(context, now)),
      store.jobs.verifiedUnitsSince(dayAgo),
      store.jobs.completedSince(dayAgo),
      store.chain.currentCampaign(),
    ]);
    const snapshot = pool.current();
    const epoch = epochOf(now, config.epochSeconds);
    return {
      network: config.network,
      chainId: config.chain.id,
      rigs,
      last24h: { verifiedUnits: verifiedUnits.toString(), jobsCompleted },
      pool: snapshot ? poolSummary(snapshot) : null,
      campaign: campaign ? campaignView(campaign) : null,
      epoch: {
        index: epoch,
        seconds: config.epochSeconds,
        startedAt: epochStart(epoch, config.epochSeconds).toISOString(),
        endsAt: epochStart(epoch + 1, config.epochSeconds).toISOString(),
      },
      jobs: { model: config.playground.model, maxTokens: config.playground.maxTokens },
      rules: WORK_RULES,
    };
  });
}
