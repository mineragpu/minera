import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import type { PoolSnapshot } from '../chain/pool.ts';
import { loadConfig, type Config } from '../config.ts';
import { createMemoryStore } from '../store/memory/index.ts';
import type { Store } from '../store/store.ts';
import { seededRandom } from './seededRandom.ts';

export interface TestApp {
  app: FastifyInstance;
  store: Store;
  config: Config;
  /** Move `clock.now` to control time inside the app. */
  clock: { now: Date };
  pool: { snapshot: PoolSnapshot | null };
}

/** The real app on a memory store, a settable clock and a settable pool snapshot. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({ DATABASE_URL: 'postgres://test@localhost/test', TRUST_PROXY_HOPS: '0', ...env });
  const store = createMemoryStore();
  const clock = { now: new Date('2026-09-29T12:00:00Z') };
  const pool: TestApp['pool'] = { snapshot: null };
  const app = await buildApp({
    logging: false,
    config,
    store,
    pool: { current: () => pool.snapshot },
    clock: () => clock.now,
    random: seededRandom(42),
  });
  return { app, store, config, clock, pool };
}
