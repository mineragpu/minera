/**
 * Signs coordinator requests with the node key, as `protocol.ts` specifies: an EIP-191 personal
 * signature over `signedMessage(chainId, method, path, timestamp, nonce, keccak256(body))`, where
 * `chainId` is the chain of the network the node runs on.
 */

import { randomBytes } from 'node:crypto';
import { NODE_HEADERS, signedMessage, type Hex } from '@dayagpu/shared';
import { keccak256 } from 'viem';
import type { MessageSigner } from './deploy-code.ts';

export interface RequestToSign {
  method: string;
  /** The URL pathname only, without the query string. */
  path: string;
  /** The exact bytes sent as the body. Empty for a request without one. */
  body: Uint8Array;
}

export interface SigningOptions {
  /** Unix seconds. Defaults to the system clock. */
  timestamp?: number;
  nonce?: string;
}

export type SignedHeaders = Record<(typeof NODE_HEADERS)[keyof typeof NODE_HEADERS], string>;

export function bodyDigest(body: Uint8Array): Hex {
  return keccak256(body);
}

export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

export async function signRequest(
  signer: MessageSigner,
  chainId: number,
  request: RequestToSign,
  options: SigningOptions = {},
): Promise<SignedHeaders> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? newNonce();
  const digest = bodyDigest(request.body);
  const message = signedMessage(chainId, request.method, request.path, timestamp, nonce, digest);
  const signature = await signer.signMessage({ message });
  return {
    [NODE_HEADERS.key]: signer.address,
    [NODE_HEADERS.timestamp]: String(timestamp),
    [NODE_HEADERS.nonce]: nonce,
    [NODE_HEADERS.signature]: signature,
  };
}
