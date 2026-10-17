import type { FastifyInstance } from 'fastify';
import { RENTAL_ID_PATTERN, RENTAL_ROUTES, type Hex, type RentalOfferView, type RentalView } from '@minera/shared';
import { z } from 'zod';
import { MarketError } from '../rentals/market.ts';
import { PriceUnavailableError } from '../rentals/price.ts';
import { RentalError, toView, type RentalService } from '../rentals/service.ts';
import type { RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { addressSchema, parse } from './validate.ts';

/** Quotes and payments per address. */
const RENTAL_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
const LIST_LIMIT = 20;

const idSchema = z.string().regex(RENTAL_ID_PATTERN, 'Expected a 32-character rental id.');

const createSchema = z.strictObject({
  operator: addressSchema,
  units: z.number().int().min(1).max(365),
  parentId: idSchema.optional(),
});

const paymentSchema = z.strictObject({
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a transaction hash.')
    .transform((value) => value.toLowerCase() as Hex),
});

/** Runs a rental call, turning its known failures into API errors. */
async function answer<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RentalError) throw new ApiError(error.statusCode, error.code, error.message);
    if (error instanceof PriceUnavailableError) {
      throw new ApiError(503, 'price_unavailable', 'The ETH price cannot be read right now. Try again in a minute.');
    }
    if (error instanceof MarketError) {
      throw new ApiError(503, 'market_unavailable', 'The GPU marketplace is not answering right now. Try again in a minute.');
    }
    throw error;
  }
}

/**
 * Renting a GPU machine from the Deploy page. Every route answers `404 rentals_off` on a coordinator
 * that does not rent machines.
 */
export function registerRentalRoutes(app: FastifyInstance, context: RouteContext): void {
  const { store, config, clock } = context;

  function service(): { rentals: RentalService; settings: NonNullable<typeof config.rentals> } {
    if (!context.rentals || !config.rentals) {
      throw new ApiError(404, 'rentals_off', 'This network does not rent GPU machines.');
    }
    return { rentals: context.rentals, settings: config.rentals };
  }

  async function find(id: string) {
    const rental = await store.rentals.get(id);
    if (!rental) throw new ApiError(404, 'rental_not_found', 'There is no rental with this id.');
    return rental;
  }

  app.get(RENTAL_ROUTES.offer, async (): Promise<RentalOfferView> => {
    const { rentals } = service();
    return answer(() => rentals.offer(clock()));
  });

  app.post(RENTAL_ROUTES.create, { config: { rateLimit: RENTAL_RATE_LIMIT } }, async (request, reply) => {
    const { rentals, settings } = service();
    const body = parse(createSchema, request.body, 'body');
    const rental = await answer(() =>
      rentals.create({ operator: body.operator, units: body.units, parentId: body.parentId ?? null }, clock()),
    );
    return reply.status(201).send(await toView(store, settings, rental));
  });

  app.get('/v1/rentals', async (request): Promise<{ rentals: RentalView[] }> => {
    const { settings } = service();
    const { operator } = parse(z.object({ operator: addressSchema }), request.query, 'query');
    const own = await store.rentals.byOperator(operator, LIST_LIMIT);
    return { rentals: await Promise.all(own.map((rental) => toView(store, settings, rental))) };
  });

  app.get('/v1/rentals/:id', async (request): Promise<RentalView> => {
    const { settings } = service();
    const { id } = parse(z.object({ id: idSchema }), request.params, 'params');
    return toView(store, settings, await find(id));
  });

  app.post('/v1/rentals/:id/payment', { config: { rateLimit: RENTAL_RATE_LIMIT } }, async (request, reply) => {
    const { rentals, settings } = service();
    const { id } = parse(z.object({ id: idSchema }), request.params, 'params');
    const { txHash } = parse(paymentSchema, request.body, 'body');
    const rental = await find(id);
    const paid = await answer(() => rentals.pay(rental, txHash, clock()));
    const latest = paid ?? (await find(id));
    return reply.status(paid === null ? 202 : 200).send(await toView(store, settings, latest));
  });
}
