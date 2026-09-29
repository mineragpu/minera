import type { PoolView } from '../chain/poolWatcher.ts';
import type { Config } from '../config.ts';
import type { Random } from '../random.ts';
import type { Store } from '../store/store.ts';

/** What every route module is built from; tests swap in a memory store and a fixed clock. */
export interface RouteContext {
  config: Config;
  store: Store;
  pool: PoolView;
  clock: () => Date;
  random: Random;
}

/** A rig counts as online when it was heard from within three heartbeats. */
export function onlineSince(context: RouteContext, now: Date): Date {
  return new Date(now.getTime() - 3 * context.config.heartbeatSeconds * 1000);
}
