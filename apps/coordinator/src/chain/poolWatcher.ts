import type { PoolSnapshot } from './pool.ts';

/** The last pool state read from the chain; public routes serve it without touching the RPC. */
export interface PoolView {
  current(): PoolSnapshot | null;
}

export interface PoolWatcher extends PoolView {
  refresh(): Promise<PoolSnapshot>;
}

export function createPoolWatcher(read: () => Promise<PoolSnapshot>): PoolWatcher {
  let latest: PoolSnapshot | null = null;
  return {
    current: () => latest,
    async refresh() {
      const snapshot = await read();
      if (!latest || snapshot.blockNumber >= latest.blockNumber) latest = snapshot;
      return snapshot;
    },
  };
}
