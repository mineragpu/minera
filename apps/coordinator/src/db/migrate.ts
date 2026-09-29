import { readdir, readFile } from 'node:fs/promises';
import type { Sql } from './client.ts';

const MIGRATIONS = new URL('./migrations/', import.meta.url);
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
// Arbitrary constant shared by every instance, so two deploys starting together migrate once.
const MIGRATION_LOCK = 4_663_046_630;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS)).filter((name) => MIGRATION_FILE.test(name)).sort();
}

/** Apply every migration not yet recorded, in filename order, in one transaction. */
export async function migrate(sql: Sql): Promise<string[]> {
  const files = await migrationFiles();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const rows = await tx<{ name: string }[]>`SELECT name FROM schema_migrations`;
    const applied = new Set(rows.map((row) => row.name));

    const newlyApplied: string[] = [];
    for (const name of files) {
      if (applied.has(name)) continue;
      const statements = await readFile(new URL(name, MIGRATIONS), 'utf8');
      await tx.unsafe(statements).simple();
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      newlyApplied.push(name);
    }
    return newlyApplied;
  });
}
