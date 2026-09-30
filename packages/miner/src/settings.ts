/**
 * Non-secret settings remembered between runs: the network the node was set up for and the
 * coordinator URL used on each network.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEFAULT_NETWORK, isNetworkKey, type NetworkKey } from '@minera/shared';

export interface Settings {
  network: NetworkKey;
  coordinators: Partial<Record<NetworkKey, string>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readSettings(path: string): Settings {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { network: DEFAULT_NETWORK, coordinators: {} };
    throw new Error(`Could not read the settings file at ${path}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The settings file at ${path} is not valid JSON. Fix or delete it.`);
  }
  if (!isRecord(parsed) || !isNetworkKey(parsed['network'])) {
    throw new Error(`The settings file at ${path} has no valid network. Fix or delete it.`);
  }
  const coordinators: Partial<Record<NetworkKey, string>> = {};
  const stored = parsed['coordinators'];
  if (isRecord(stored)) {
    for (const [network, url] of Object.entries(stored)) {
      if (isNetworkKey(network) && typeof url === 'string') coordinators[network] = url;
    }
  }
  return { network: parsed['network'], coordinators };
}

export function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, path);
}
