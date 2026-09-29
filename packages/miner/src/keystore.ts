/**
 * The node key: created once per rig and kept in a file only the current user can read.
 *
 * The private key never leaves this module. Callers get a viem account, which signs but does not
 * expose the key, so no other code path can print or send it.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Address } from '@dayagpu/shared';
import type { LocalAccount } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export interface NodeKey {
  readonly address: Address;
  readonly account: LocalAccount;
}

interface KeyFile {
  version: 1;
  address: Address;
  privateKey: `0x${string}`;
  createdAt: string;
}

export class KeyExistsError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`A node key already exists at ${path}.`);
    this.name = 'KeyExistsError';
    this.path = path;
  }
}

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function createNodeKey(path: string, options: { force: boolean }): NodeKey {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const file: KeyFile = {
    version: 1,
    address: account.address,
    privateKey,
    createdAt: new Date().toISOString(),
  };
  const contents = `${JSON.stringify(file, null, 2)}\n`;

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (options.force) {
    const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } else {
    try {
      writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new KeyExistsError(path);
      throw error;
    }
  }
  return { address: account.address, account };
}

/** Returns null when no key has been created yet. */
export function loadNodeKey(path: string): NodeKey | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Could not read the node key at ${path}.`);
  }
  // Parser errors quote the input, which here is the private key, so they are never passed on.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The node key at ${path} is not valid JSON.`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`The node key at ${path} is not a key file.`);
  }
  const { privateKey, address } = parsed as Partial<Record<keyof KeyFile, unknown>>;
  if (typeof privateKey !== 'string' || !PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error(`The node key at ${path} does not hold a valid private key.`);
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  if (typeof address !== 'string' || address.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`The node key at ${path} does not match the address recorded in it.`);
  }
  return { address: account.address, account };
}

/** True when a POSIX key file can be read by other users. Windows relies on profile ACLs. */
export function isKeyFileShared(path: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') return false;
  return (statSync(path).mode & 0o077) !== 0;
}
