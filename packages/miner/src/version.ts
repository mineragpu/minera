/**
 * The client version, read from the package manifest so there is one place to bump it.
 */

import { readFileSync } from 'node:fs';

function readVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const version = typeof manifest === 'object' && manifest !== null ? (manifest as { version?: unknown }).version : null;
  return typeof version === 'string' ? version : '0.0.0';
}

export const CLIENT_VERSION: string = readVersion();
