import type { FastifyInstance } from 'fastify';
import {
  PAIRING_CODE_PATTERN,
  PAIRING_ROUTES,
  PAIRING_TTL_SECONDS,
  type Hex,
  type PairingView,
} from '@minera/shared';
import { z } from 'zod';
import { deployCodeSigner } from '../chain/deployCode.ts';
import type { PairingRecord } from '../store/records.ts';
import type { RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { addressSchema, parse } from './validate.ts';

/** Pairings per machine address. A machine pairs once, or again after a restart. */
const PAIRING_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

const codeSchema = z.string().regex(PAIRING_CODE_PATTERN, 'Expected the 32-character pairing code from the Deploy page.');

const pairingSchema = z.strictObject({
  code: codeSchema,
  nodeAddress: addressSchema,
  operator: addressSchema,
  deployCode: z
    .string()
    .regex(/^0x[0-9a-fA-F]{130}$/, 'Expected a 65-byte deploy code.')
    .transform((value) => value.toLowerCase() as Hex),
  gpu: z
    .strictObject({
      model: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[\x20-\x7e]+$/, 'Expected printable characters.'),
      vramMb: z.number().int().min(0).max(4_194_304),
    })
    .nullable(),
  clientVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Expected a version such as 1.2.0.'),
});

function view(record: PairingRecord): PairingView {
  return {
    code: record.code,
    nodeAddress: record.nodeKey,
    operator: record.operator,
    deployCode: record.deployCode,
    gpu: record.gpu,
    clientVersion: record.clientVersion,
    pairedAt: record.pairedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

/**
 * A GPU machine hands its node address and deploy code to the Deploy page under the page's code.
 * The deploy code is checked here, so a pairing only ever holds a code that deploys its node for
 * its operator on this network's registry.
 */
export function registerPairingRoutes(app: FastifyInstance, context: RouteContext): void {
  const { store, config, clock } = context;

  app.post(PAIRING_ROUTES.create, { config: { rateLimit: PAIRING_RATE_LIMIT } }, async (request, reply) => {
    const body = parse(pairingSchema, request.body, 'body');
    const signer = await deployCodeSigner(body.deployCode, config.chain.id, config.deployment.rigRegistry, body.operator);
    if (signer !== body.nodeAddress) {
      throw new ApiError(
        400,
        'deploy_code_mismatch',
        `The deploy code was not made by this node for this wallet on ${config.chain.name}.`,
      );
    }
    const now = clock();
    const record: PairingRecord = {
      code: body.code,
      nodeKey: body.nodeAddress,
      operator: body.operator,
      deployCode: body.deployCode,
      gpu: body.gpu,
      clientVersion: body.clientVersion,
      pairedAt: now,
      expiresAt: new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000),
    };
    if (!(await store.pairings.put(record))) {
      throw new ApiError(409, 'pairing_taken', 'Another machine already paired with this code. Open the Deploy page again for a new one.');
    }
    return reply.status(201).send(view(record));
  });

  app.get('/v1/pairings/:code', async (request): Promise<PairingView> => {
    const { code } = parse(z.object({ code: codeSchema }), request.params, 'params');
    const record = await store.pairings.get(code, clock());
    if (!record) throw new ApiError(404, 'pairing_not_found', 'No machine has paired with this code yet.');
    return view(record);
  });
}
