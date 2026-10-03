/**
 * Every query is a tagged template: postgres.js sends each interpolated value to the server as a
 * bind parameter ($1, $2, ...) of the extended query protocol, never as SQL text, so no value can
 * change a statement. The only raw SQL is the migration files in this repository, run by
 * `migrate.ts`; `sqlSafety.test.ts` fails the build if raw SQL appears anywhere else.
 */
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
