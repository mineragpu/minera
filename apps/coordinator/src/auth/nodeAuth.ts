import { keccak256, recoverMessageAddress } from 'viem';
import {
  MAX_CLOCK_SKEW_SECONDS,
  NODE_HEADERS,
  signedMessage,
  type Address,
  type Hex,
} from '@dayagpu/shared';

export interface SignedRequest {
  method: string;
  /** The request target exactly as sent, including any query string. */
  path: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /** The raw body bytes; `null` for a request without a body. */
  body: Uint8Array | null;
}

export interface NodeAuthDeps<R extends { retired: boolean }> {
  /** The chain this coordinator serves; a request signed for any other chain is refused. */
  chainId: number;
  now: () => Date;
  findRig(nodeKey: Address): Promise<R | null>;
  /** Record the nonce; resolves `false` when it was already used. */
  useNonce(nodeKey: Address, nonce: string, expiresAt: Date): Promise<boolean>;
}

export type NodeAuthCode =
  | 'missing_header'
  | 'malformed_header'
  | 'stale_request'
  | 'bad_signature'
  | 'replayed_request'
  | 'unknown_rig'
  | 'retired_rig';

export class NodeAuthError extends Error {
  override name = 'NodeAuthError';
  readonly statusCode: 401 | 403;
  readonly code: NodeAuthCode;

  constructor(statusCode: 401 | 403, code: NodeAuthCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TIMESTAMP = /^\d{1,12}$/;
const NONCE = /^[A-Za-z0-9_-]{8,128}$/;
const SIGNATURE = /^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/;
const EMPTY = new Uint8Array();

function header(request: SignedRequest, name: string, format: RegExp): string {
  const value = request.headers[name];
  if (value === undefined || value === '') {
    throw new NodeAuthError(401, 'missing_header', `The ${name} header is required.`);
  }
  if (typeof value !== 'string' || !format.test(value)) {
    throw new NodeAuthError(401, 'malformed_header', `The ${name} header is malformed.`);
  }
  return value;
}

/**
 * Authenticate a signed node request and return the rig that sent it.
 *
 * The nonce is recorded only after the signature and the rig check pass, so unsigned traffic
 * cannot fill the nonce table.
 */
export async function verifyNodeRequest<R extends { retired: boolean }>(
  request: SignedRequest,
  deps: NodeAuthDeps<R>,
): Promise<R> {
  const nodeKey = header(request, NODE_HEADERS.key, ADDRESS).toLowerCase() as Address;
  const timestamp = Number(header(request, NODE_HEADERS.timestamp, TIMESTAMP));
  const nonce = header(request, NODE_HEADERS.nonce, NONCE);
  const signature = header(request, NODE_HEADERS.signature, SIGNATURE) as Hex;

  const now = deps.now().getTime();
  if (Math.abs(now / 1000 - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw new NodeAuthError(
      401,
      'stale_request',
      `The request timestamp is more than ${MAX_CLOCK_SKEW_SECONDS} seconds away from the coordinator clock.`,
    );
  }

  const bodyDigest = keccak256(request.body ?? EMPTY);
  const message = signedMessage(deps.chainId, request.method, request.path, timestamp, nonce, bodyDigest);
  let signer: Address;
  try {
    signer = await recoverMessageAddress({ message, signature });
  } catch {
    throw new NodeAuthError(401, 'bad_signature', 'The signature could not be read.');
  }
  if (signer.toLowerCase() !== nodeKey) {
    throw new NodeAuthError(401, 'bad_signature', `The signature does not match ${NODE_HEADERS.key}.`);
  }

  const rig = await deps.findRig(nodeKey);
  if (!rig) {
    throw new NodeAuthError(
      403,
      'unknown_rig',
      'This node key is not a deployed rig. Deploy the rig on the registry first.',
    );
  }
  if (rig.retired) throw new NodeAuthError(403, 'retired_rig', 'This rig is retired and can no longer take work.');

  const expiresAt = new Date((timestamp + MAX_CLOCK_SKEW_SECONDS + 1) * 1000);
  if (!(await deps.useNonce(nodeKey, nonce, expiresAt))) {
    throw new NodeAuthError(
      401,
      'replayed_request',
      'This nonce was already used. Send a fresh nonce with every request.',
    );
  }
  return rig;
}
