import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { NODE_HEADERS } from '@dayagpu/shared';
import type { LogLevel } from './config.ts';
import { registerClaimRoute } from './routes/claims.ts';
import type { RouteContext } from './routes/context.ts';
import { ApiError, registerErrorHandling } from './routes/errors.ts';
import { registerHealthRoute } from './routes/health.ts';
import { registerNetworkRoute } from './routes/network.ts';
import { registerNodeRoutes } from './routes/node.ts';
import { registerPoolRoute } from './routes/pool.ts';
import { keepRawJsonBodies } from './routes/rawBody.ts';
import { registerRigRoutes } from './routes/rigs.ts';
import { registerSettlementRoute } from './routes/settlements.ts';

export interface AppOptions extends RouteContext {
  /** Tests turn logging off; the service logs at the configured level. */
  logging: boolean;
}

const BODY_LIMIT_BYTES = 256 * 1024;
const GLOBAL_RATE_LIMIT = { max: 600, timeWindow: '1 minute' } as const;

type LoggerOptions = Exclude<FastifyServerOptions['logger'], boolean | undefined>;

function loggerOptions(level: LogLevel): LoggerOptions {
  return {
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        `req.headers["${NODE_HEADERS.signature}"]`,
        `req.headers["${NODE_HEADERS.nonce}"]`,
      ],
      censor: '[redacted]',
    },
  };
}

/** Build the HTTP app without listening, so tests can inject requests into it. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { logging, ...context } = options;
  const { config } = context;
  const hops = config.trustProxyHops;
  const app = Fastify({
    logger: logging ? loggerOptions(config.logLevel) : false,
    // Trust exactly the proxies in front of the service, so a client cannot choose its own address.
    trustProxy: hops > 0 ? (_address: string, hop: number) => hop < hops : false,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  keepRawJsonBodies(app);
  registerErrorHandling(app);
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : false,
    methods: ['GET', 'POST'],
  });
  await app.register(rateLimit, {
    global: true,
    ...GLOBAL_RATE_LIMIT,
    errorResponseBuilder: (_request, limit) =>
      new ApiError(429, 'rate_limited', `Too many requests. Try again in ${limit.after}.`),
  });

  registerHealthRoute(app, context);
  registerNetworkRoute(app, context);
  registerRigRoutes(app, context);
  registerPoolRoute(app, context);
  registerSettlementRoute(app, context);
  registerClaimRoute(app, context);
  registerNodeRoutes(app, context);
  return app;
}
