import postgres from 'postgres';
import type { Logger } from '../log.ts';
import type { Secret } from '../secret.ts';

export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;
/** Either the pool or an open transaction; queries read the same through both. */
export type Queryable = Sql | TransactionSql;

export function createSql(url: Secret<string>, log: Logger): Sql {
  return postgres(url.reveal(), {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { application_name: 'coordinator' },
    onnotice: (notice) => log.debug({ notice: notice.message }, 'database notice'),
  });
}
