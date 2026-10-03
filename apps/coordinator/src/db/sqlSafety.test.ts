import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const SRC = new URL('../', import.meta.url);
/** Raw SQL is allowed only where the migration files from this repository are applied. */
const RAW_SQL_ALLOWED = new Set(['db/migrate.ts']);
const RAW_SQL = /\.unsafe\s*\(|\.simple\s*\(|\.file\s*\(/;
/** A query whose text is a plain string or a concatenation, instead of a tagged template. */
const STRING_QUERY = /\b(?:db|sql|tx|admin)\s*\(\s*['"`]|\b(?:db|sql|tx)\s*\([^)]*\+/;

async function sourceFiles(dir: URL, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...(await sourceFiles(new URL(`${entry.name}/`, dir), `${path}/`)));
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
  }
  return files;
}

describe('sql safety', () => {
  it('runs raw sql only where the repository migrations are applied', async () => {
    const offenders: string[] = [];
    for (const path of await sourceFiles(SRC)) {
      if (RAW_SQL_ALLOWED.has(path)) continue;
      if (RAW_SQL.test(await readFile(new URL(path, SRC), 'utf8'))) offenders.push(path);
    }
    assert.deepEqual(offenders, []);
  });

  it('builds every query as a tagged template, never from strings', async () => {
    const offenders: string[] = [];
    for (const path of await sourceFiles(SRC)) {
      const lines = (await readFile(new URL(path, SRC), 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (STRING_QUERY.test(line)) offenders.push(`${path}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, []);
  });

  it('reads migrations only from the repository folder', async () => {
    const migrate = await readFile(new URL('db/migrate.ts', SRC), 'utf8');
    assert.match(migrate, /new URL\('\.\/migrations\/', import\.meta\.url\)/);
    assert.match(migrate, /\^\\d\{3\}_\[a-z0-9_\]\+\\\.sql\$/);
  });
});
