import { randomBytes } from 'node:crypto';
import { keccak256, toBytes } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { NODE_HEADERS, signedMessage } from '@minera/shared';

export interface SigningOptions {
  /** The chain of the coordinator the request is meant for. */
  chainId: number;
  method: string;
  path: string;
  body?: string;
  /** Unix seconds; defaults to the current time. */
  timestamp?: number;
  nonce?: string;
}

/** Sign a request the way the node client does, for tests. */
export async function signNodeRequest(
  account: PrivateKeyAccount,
  options: SigningOptions,
): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? randomBytes(16).toString('hex');
  const bodyDigest = keccak256(toBytes(options.body ?? ''));
  const signature = await account.signMessage({
    message: signedMessage(options.chainId, options.method, options.path, timestamp, nonce, bodyDigest),
  });
  return {
    [NODE_HEADERS.key]: account.address,
    [NODE_HEADERS.timestamp]: String(timestamp),
    [NODE_HEADERS.nonce]: nonce,
    [NODE_HEADERS.signature]: signature,
  };
}
