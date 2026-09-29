import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Address } from '@dayagpu/shared';
import { epochOf } from '../epoch.ts';
import { onlineSince, type RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { iso, rigSummary, type RigSummary } from './format.ts';
import { addressSchema, parse } from './validate.ts';

const HOUR_MS = 3_600_000;
const ETH_PAIR = '0x0000000000000000000000000000000000000000' as Address;

const listQuery = z.object({
  sort: z.enum(['new', 'top', 'epoch']).default('new'),
  /** `eth` or the token address the rig is paired with. */
  pair: z.union([z.literal('eth').transform(() => ETH_PAIR), addressSchema]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export interface RigBoard {
  total: number;
  limit: number;
  offset: number;
  epoch: number;
  rigs: RigSummary[];
}

export interface RigDetail extends RigSummary {
  retired: boolean;
  retiredAt: string | null;
  deployedBlock: string;
  /** Verified units per hour over the last 24 hours, oldest first, including empty hours. */
  hourly: { hour: string; verifiedUnits: string }[];
}

export function registerRigRoutes(app: FastifyInstance, context: RouteContext): void {
  const { store, config, clock } = context;

  app.get('/v1/rigs', async (request): Promise<RigBoard> => {
    const query = parse(listQuery, request.query, 'query');
    const now = clock();
    const epoch = epochOf(now, config.epochSeconds);
    const page = await store.rigs.list({
      sort: query.sort,
      pair: query.pair ?? null,
      epoch,
      limit: query.limit,
      offset: query.offset,
    });
    const since = onlineSince(context, now);
    return {
      total: page.total,
      limit: query.limit,
      offset: query.offset,
      epoch,
      rigs: page.rigs.map((rig) => rigSummary(rig, rig.epochUnits, since)),
    };
  });

  app.get('/v1/rigs/:nodeKey', async (request): Promise<RigDetail> => {
    const { nodeKey } = parse(z.object({ nodeKey: addressSchema }), request.params, 'params');
    const rig = await store.rigs.get(nodeKey);
    if (!rig) throw new ApiError(404, 'rig_not_found', 'There is no deployed rig with this node key.');

    const now = clock();
    const firstHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - 23 * HOUR_MS;
    const [epochUnits, hours] = await Promise.all([
      store.work.epochUnits(nodeKey, epochOf(now, config.epochSeconds)),
      store.jobs.hourlyVerifiedUnits(nodeKey, new Date(firstHour)),
    ]);
    const unitsByHour = new Map(hours.map((entry) => [entry.hour.getTime(), entry.units]));
    return {
      ...rigSummary(rig, epochUnits, onlineSince(context, now)),
      retired: rig.retired,
      retiredAt: iso(rig.retiredAt),
      deployedBlock: rig.deployedBlock.toString(),
      hourly: Array.from({ length: 24 }, (_, offset) => {
        const hour = firstHour + offset * HOUR_MS;
        return { hour: new Date(hour).toISOString(), verifiedUnits: (unitsByHour.get(hour) ?? 0n).toString() };
      }),
    };
  });
}
