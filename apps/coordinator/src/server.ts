import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { createChainClient } from './chain/client.ts';
import { indexNextRange } from './chain/indexer.ts';
import { readPoolSnapshot } from './chain/pool.ts';
import { createPoolWatcher } from './chain/poolWatcher.ts';
import { ConfigError, configSummary, loadConfig, type Config } from './config.ts';
import { createSql } from './db/client.ts';
import { migrate } from './db/migrate.ts';
import { sweepJobs } from './jobs/janitor.ts';
import { errorSummary, type Logger } from './log.ts';
import { startLoop, type Loop } from './loop.ts';
import { cryptoRandom } from './random.ts';
import { createPublisher } from './settlement/publisher.ts';
import { nextRoundDelay, settleOnce, type SettleOutcome } from './settlement/worker.ts';
import { createPostgresStore } from './store/postgres/index.ts';

const INDEX_POLL_MS = 5_000;
const POOL_REFRESH_MS = 15_000;
const JANITOR_MS = 10_000;
const RETRY_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 20_000;

function logSettlement(log: Logger, outcome: SettleOutcome): void {
  switch (outcome.kind) {
    case 'published':
      log.info({ index: outcome.index, txHash: outcome.txHash, total: outcome.total.toString() }, 'settlement published');
      break;
    case 'sent':
      log.info({ txHash: outcome.txHash }, 'settlement sent, waiting for its receipt');
      break;
    case 'failed':
      log.error({ reason: outcome.reason }, 'settlement failed');
      break;
    case 'waiting':
    case 'skipped':
      log.info({ reason: outcome.reason }, `settlement ${outcome.kind}`);
      break;
  }
}

async function start(config: Config): Promise<void> {
  let app: FastifyInstance | undefined;
  const sql = createSql(config.databaseUrl, (message) => app?.log.debug({ notice: message }, 'database notice'));
  const store = createPostgresStore(sql);
  const client = createChainClient(config.chain, config.rpcUrls);
  const { deployment } = config;
  const pool = createPoolWatcher(() => readPoolSnapshot(client, deployment.burnPool));
  app = await buildApp({ logging: true, config, store, pool, clock: () => new Date(), random: cryptoRandom });
  const log = app.log;
  log.info(configSummary(config), 'starting coordinator');

  const applied = await migrate(sql);
  log.info({ applied }, 'database migrated');

  const publisher = config.publisherKey
    ? createPublisher({ key: config.publisherKey, chain: config.chain, rpcUrls: config.rpcUrls, client, pool: deployment.burnPool })
    : null;
  if (!publisher) log.warn('no publisher key is configured; settlements run in dry mode and are never published');

  const loops: Loop[] = [
    startLoop({
      name: 'indexer',
      log,
      retryMs: RETRY_MS,
      run: async () => {
        const range = await indexNextRange({ client, store, deployment });
        if (range && range.events > 0) log.info(range, 'indexed chain events');
        return range && !range.caughtUp ? 0 : INDEX_POLL_MS;
      },
    }),
    startLoop({
      name: 'pool',
      log,
      retryMs: RETRY_MS,
      run: async () => {
        await pool.refresh();
        return POOL_REFRESH_MS;
      },
    }),
    startLoop({
      name: 'janitor',
      log,
      retryMs: RETRY_MS,
      run: async () => {
        const now = new Date();
        const swept = await sweepJobs(store, now, config.epochSeconds);
        if (swept.requeued > 0 || swept.expired > 0) log.info(swept, 'swept overdue jobs');
        await store.nonces.prune(now);
        return JANITOR_MS;
      },
    }),
    startLoop({
      name: 'settlement',
      log,
      retryMs: RETRY_MS,
      run: async () => {
        const outcome = await settleOnce({
          store,
          readPool: () => pool.refresh(),
          client,
          publisher,
          now: () => new Date(),
          epochSeconds: config.epochSeconds,
          chainId: config.chain.id,
          burnPool: deployment.burnPool,
        });
        logSettlement(log, outcome);
        return nextRoundDelay(outcome, new Date(), config.epochSeconds);
      },
    }),
  ];

  let stopping = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.info({ reason }, 'shutting down');
    setTimeout(() => {
      log.error('shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    await app?.close();
    await Promise.all(loops.map((loop) => loop.stop()));
    await sql.end({ timeout: 5 });
    log.info('stopped');
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      shutdown(signal)
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          log.error({ error: errorSummary(error) }, 'shutdown failed');
          process.exit(1);
        });
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    await shutdown('the server could not listen');
    throw error;
  }
}

try {
  await start(loadConfig(process.env));
} catch (error) {
  // Before the logger exists, a startup problem can only be reported on stderr. The summary never
  // includes a connection string, a key or an RPC URL.
  const { name, message } = errorSummary(error);
  process.stderr.write(
    error instanceof ConfigError ? `${message}\n` : `the coordinator failed to start: ${name}: ${message}\n`,
  );
  process.exitCode = 1;
}
