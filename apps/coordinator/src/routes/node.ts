import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  NODE_ROUTES,
  PROTOCOL_VERSION,
  type GpuInfo,
  type HeartbeatResponse,
  type HelloResponse,
  type JobResultResponse,
  type RuntimeInfo,
} from '@minera/shared';
import { NodeAuthError, verifyNodeRequest } from '../auth/nodeAuth.ts';
import { issueBenchmark } from '../jobs/benchmark.ts';
import { assignJobs } from '../jobs/dispatch.ts';
import { JOB_POLICY } from '../jobs/policy.ts';
import { acceptResult } from '../jobs/results.ts';
import { requestBudget } from '../sentinel/budget.ts';
import { networkKey } from '../sentinel/network.ts';
import { SENTINEL_POLICY } from '../sentinel/policy.ts';
import type { RigRecord } from '../store/records.ts';
import type { RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { jobIdSchema, parse } from './validate.ts';

// What a node reports is stored and shown on the board, so every field is held to the narrowest
// shape honest clients produce: names and versions are single tokens, and no field carries control
// characters.
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/;
const RUNTIME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
const CARD_ID = /^[0-9A-Za-z][0-9A-Za-z:._-]{3,127}$/;
const PRINTABLE = /^[^\p{Cc}]+$/u;

const runtimeSchema = z.object({
  runtime: z.string().min(1).max(64).regex(RUNTIME, 'must be the runtime interface name'),
  version: z.string().max(64).regex(VERSION, 'must be a version').optional(),
  models: z.array(z.string().min(1).max(128).regex(MODEL, 'must be a model name')).max(64),
});

const helloSchema = z.object({
  protocol: z.literal(PROTOCOL_VERSION, `Only protocol version ${PROTOCOL_VERSION} is supported.`),
  clientVersion: z.string().min(1).max(64).regex(VERSION, 'must be a version'),
  gpu: z
    .object({
      model: z.string().min(1).max(128).regex(PRINTABLE, 'must not contain control characters'),
      vramMb: z.number().int().min(0).max(10_000_000),
      driver: z.string().max(64).regex(VERSION, 'must be a driver version').optional(),
      uuid: z.string().regex(CARD_ID, 'must be the driver id of the card').optional(),
    })
    .nullable(),
  runtime: runtimeSchema,
});

const heartbeatSchema = z.object({
  load: z.object({ busy: z.boolean(), queue: z.number().int().min(0).max(10_000) }),
  runtime: runtimeSchema,
});

const resultSchema = z.object({
  output: z.string().max(JOB_POLICY.maxOutputChars),
  // Accepted for the node's own logs; payment never reads it.
  reported: z.object({
    promptTokens: z.number().int().min(0),
    completionTokens: z.number().int().min(0),
    durationMs: z.number().min(0),
  }),
});

function runtimeInfo(value: z.output<typeof runtimeSchema>): RuntimeInfo {
  const models = [...new Set(value.models)];
  return value.version === undefined
    ? { runtime: value.runtime, models }
    : { runtime: value.runtime, version: value.version, models };
}

function gpuInfo(value: z.output<typeof helloSchema>['gpu']): GpuInfo | null {
  if (value === null) return null;
  const { model, vramMb, driver, uuid } = value;
  const info: GpuInfo = { model, vramMb };
  if (driver !== undefined) info.driver = driver;
  if (uuid !== undefined) info.uuid = uuid;
  return info;
}

export function registerNodeRoutes(app: FastifyInstance, context: RouteContext): void {
  const { store, config, clock, random } = context;
  const budget = requestBudget(SENTINEL_POLICY.requestsPerMinute);
  const salt = config.sentinel.networkSalt.reveal();
  const speedFloor = config.sentinel.minTokensPerSecond;

  /**
   * The identity gate: a valid signature from a deployed rig, a fresh nonce, and a request budget
   * per key. Every refusal is tallied.
   */
  const authenticate = async (request: FastifyRequest): Promise<RigRecord> => {
    let rig: RigRecord;
    try {
      rig = await verifyNodeRequest(
        { method: request.method, path: request.url, headers: request.headers, body: request.rawBody },
        {
          chainId: config.chain.id,
          now: clock,
          findRig: (nodeKey) => store.rigs.get(nodeKey),
          useNonce: (...args) => store.nonces.use(...args),
        },
      );
    } catch (error) {
      if (error instanceof NodeAuthError) await store.sentinel.tally('identity', 'blocked', clock());
      throw error;
    }
    if (!budget.take(rig.nodeKey, clock())) {
      await store.sentinel.tally('identity', 'blocked', clock());
      throw new ApiError(
        429,
        'rate_limited',
        `This rig sent more than ${SENTINEL_POLICY.requestsPerMinute} requests in a minute. Slow down and retry.`,
      );
    }
    return rig;
  };

  const networkOf = (request: FastifyRequest): string | null => networkKey(request.ip, salt);

  const reload = async (rig: RigRecord): Promise<RigRecord> => (await store.rigs.get(rig.nodeKey)) ?? rig;

  app.post(NODE_ROUTES.hello, async (request): Promise<HelloResponse> => {
    const rig = await authenticate(request);
    const hello = parse(helloSchema, request.body, 'body');
    const now = clock();
    // A hello issues a fresh benchmark; without a pause a script could reset its checks at will.
    const cooldownMs = SENTINEL_POLICY.helloCooldownSeconds * 1000;
    if (rig.helloAt !== null && now.getTime() - rig.helloAt.getTime() < cooldownMs) {
      await store.sentinel.tally('identity', 'blocked', now);
      throw new ApiError(
        429,
        'hello_cooldown',
        `Wait ${SENTINEL_POLICY.helloCooldownSeconds} seconds between hellos from the same rig.`,
      );
    }
    await store.rigs.recordHello(
      rig.nodeKey,
      {
        clientVersion: hello.clientVersion,
        gpu: gpuInfo(hello.gpu),
        runtime: runtimeInfo(hello.runtime),
        network: networkOf(request),
      },
      now,
    );
    await store.sentinel.tally('identity', 'passed', now);
    const benchmark = await issueBenchmark(store, await reload(rig), config.playground.model, now, random);
    return {
      rig: { nodeKey: rig.nodeKey, operator: rig.operator, name: rig.name, pair: rig.pair },
      heartbeatSeconds: config.heartbeatSeconds,
      benchmark,
    };
  });

  app.post(NODE_ROUTES.heartbeat, async (request): Promise<HeartbeatResponse> => {
    const rig = await authenticate(request);
    const heartbeat = parse(heartbeatSchema, request.body, 'body');
    const now = clock();
    await store.rigs.recordHeartbeat(rig.nodeKey, runtimeInfo(heartbeat.runtime), networkOf(request), now);
    const jobs = await assignJobs(
      store,
      await reload(rig),
      heartbeat.load,
      config.playground.model,
      now,
      random,
      speedFloor,
    );
    return { heartbeatSeconds: config.heartbeatSeconds, jobs };
  });

  app.post('/v1/node/jobs/:id/result', async (request): Promise<JobResultResponse> => {
    const rig = await authenticate(request);
    const { id } = parse(z.object({ id: jobIdSchema }), request.params, 'params');
    const result = parse(resultSchema, request.body, 'body');
    const decision = await acceptResult(store, {
      nodeKey: rig.nodeKey,
      jobId: id,
      output: result.output,
      now: clock(),
      epochSeconds: config.epochSeconds,
      speedFloor,
      random,
    });
    switch (decision.kind) {
      case 'accepted':
        return { accepted: true };
      case 'closed':
        return { accepted: false, reason: decision.reason };
      case 'not_found':
        throw new ApiError(404, 'job_not_found', 'There is no job with this id.');
      case 'not_assignee':
        throw new ApiError(403, 'not_assignee', 'This job is not assigned to your rig.');
    }
  });
}
