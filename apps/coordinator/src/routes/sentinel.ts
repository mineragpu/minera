import type { FastifyInstance } from 'fastify';
import { SENTINEL_ROUTE, type SentinelStats } from '@minera/shared';
import type { RouteContext } from './context.ts';

const DAY_MS = 86_400_000;

/** Sentinel's gate decisions over the last day and the fleet by standing, straight from the store. */
export function registerSentinelRoute(app: FastifyInstance, context: RouteContext): void {
  const { store, clock } = context;

  app.get(SENTINEL_ROUTE, async (): Promise<SentinelStats> => {
    const now = clock();
    const [gates, standing] = await Promise.all([
      store.sentinel.gateCounts(new Date(now.getTime() - DAY_MS)),
      store.rigs.standingCounts(),
    ]);
    return { asOf: now.toISOString(), gates, standing };
  });
}
