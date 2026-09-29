import postgres from 'postgres';
import type { Secret } from '../secret.ts';

export type Sql = postgres.Sql;
/** The pool or an open transaction; queries read the same through both. */
export type Queryable = postgres.ISql;
/** A piece of SQL with its parameters, embedded into another query. */
export type Fragment = postgres.PendingQuery<postgres.Row[]>;

export function createSql(url: Secret<string>, onNotice: (message: string) => void): Sql {
  return postgres(url.reveal(), {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { application_name: 'coordinator' },
    onnotice: (notice) => onNotice(notice.message ?? 'notice without a message'),
  });
}
