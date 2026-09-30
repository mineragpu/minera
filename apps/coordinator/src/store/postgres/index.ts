import type { Queryable, Sql } from '../../db/client.ts';
import type { Store } from '../store.ts';
import { postgresChain } from './chain.ts';
import { postgresJobs } from './jobs.ts';
import { postgresNonces } from './nonces.ts';
import { postgresRigs } from './rigs.ts';
import { postgresSentinel } from './sentinel.ts';
import { postgresSettlements } from './settlements.ts';
import { postgresWork } from './work.ts';

// Arbitrary constant; every write transaction takes it, which serializes them across instances.
const WRITE_LOCK = 4_663_000_001;

function parts(db: Queryable): Omit<Store, 'transaction'> {
  return {
    rigs: postgresRigs(db),
    nonces: postgresNonces(db),
    jobs: postgresJobs(db),
    work: postgresWork(db),
    settlements: postgresSettlements(db),
    chain: postgresChain(db),
    sentinel: postgresSentinel(db),
  };
}

export function createPostgresStore(sql: Sql): Store {
  return {
    ...parts(sql),
    async transaction<T>(work: (store: Store) => Promise<T>): Promise<T> {
      let result: T | undefined;
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(${WRITE_LOCK})`;
        const inTransaction: Store = { ...parts(tx), transaction: (inner) => inner(inTransaction) };
        result = await work(inTransaction);
      });
      return result as T;
    },
  };
}
