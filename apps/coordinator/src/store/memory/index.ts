import type { Store } from '../store.ts';
import { memoryChain } from './chain.ts';
import { memoryJobs } from './jobs.ts';
import { memoryNonces } from './nonces.ts';
import { memoryRigs } from './rigs.ts';
import { memorySentinel } from './sentinel.ts';
import { memorySettlements } from './settlements.ts';
import { emptyState, type StateBox } from './state.ts';
import { memoryWork } from './work.ts';

/**
 * A store held in process memory, used by the tests. Transactions are serialized and roll back to
 * a snapshot when their work throws.
 */
export function createMemoryStore(): Store {
  const box: StateBox = { state: emptyState() };
  const parts = {
    rigs: memoryRigs(box),
    nonces: memoryNonces(box),
    jobs: memoryJobs(box),
    work: memoryWork(box),
    settlements: memorySettlements(box),
    chain: memoryChain(box),
    sentinel: memorySentinel(box),
  };

  const inTransaction: Store = {
    ...parts,
    transaction: (work) => work(inTransaction),
  };

  let queue: Promise<unknown> = Promise.resolve();
  return {
    ...parts,
    transaction<T>(work: (store: Store) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        const snapshot = structuredClone(box.state);
        try {
          return await work(inTransaction);
        } catch (error) {
          box.state = snapshot;
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
