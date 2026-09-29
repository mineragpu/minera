/**
 * The client version, read from the package manifest so there is one place to bump it.
 */

import { readFileSync } from 'node:fs';

function readVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (typeof manifest !== 'object' || manifest === null) return '0.0.0';
  const { version } = manifest as Record<string, unknown>;
  return typeof version === 'string' ? version : '0.0.0';
}

export const CLIENT_VERSION: string = readVersion();
