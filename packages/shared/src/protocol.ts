/**
 * The wire protocol between the coordinator and the node client.
 *
 * Every request a node makes is signed by its node key with an EIP-191 personal signature over
 * `signedMessage(...)`. The signature binds the chain id, so a request signed for one network is
 * refused by the coordinator of another, even when the same node key is a rig on both. The
 * coordinator recovers the signer, requires it to be a deployed rig on the registry, and rejects
 * anything older than `MAX_CLOCK_SKEW_SECONDS` or replayed with a used nonce. Values that decide
 * payment are never taken from the node: the coordinator measures them.
 */

import type { Address } from './rewards.ts';

export const PROTOCOL_VERSION = 1;
export const MAX_CLOCK_SKEW_SECONDS = 120;

export type Hex = `0x${string}`;

/** Headers carried by every signed node request. */
export const NODE_HEADERS = {
  key: 'x-node-key',
  timestamp: 'x-node-timestamp',
  nonce: 'x-node-nonce',
  signature: 'x-node-signature',
} as const;

/** The exact string a node signs for one request to the coordinator of chain `chainId`. */
export function signedMessage(
  chainId: number,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyDigest: Hex,
): string {
  return [
    'rig-request-v1',
    String(chainId),
    method.toUpperCase(),
    path,
    String(timestamp),
    nonce,
    bodyDigest,
  ].join('\n');
}

export interface GpuInfo {
  /** Model string as reported by the driver. Shown only to the rig's operator. */
  model: string;
  vramMb: number;
  driver?: string;
}

export interface RuntimeInfo {
  /** Inference runtime the node drives, for example a local model server. */
  runtime: string;
  version?: string;
  /** Models the node can serve right now. */
  models: string[];
}

export interface HelloRequest {
  protocol: typeof PROTOCOL_VERSION;
  clientVersion: string;
  gpu: GpuInfo | null;
  runtime: RuntimeInfo;
}

export interface HelloResponse {
  rig: { nodeKey: Address; operator: Address; name: string; pair: Address };
  heartbeatSeconds: number;
  /** The work the coordinator wants measured before the rig receives paid jobs. */
  benchmark: JobAssignment | null;
}

export interface HeartbeatRequest {
  load: { busy: boolean; queue: number };
  runtime: RuntimeInfo;
}

export interface HeartbeatResponse {
  heartbeatSeconds: number;
  jobs: JobAssignment[];
}

export type JobKind = 'chat' | 'benchmark' | 'challenge';

export interface JobAssignment {
  id: string;
  kind: JobKind;
  model: string;
  /** Deterministic settings so replayed jobs can be compared. */
  params: { temperature: 0; seed: number; maxTokens: number };
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /** Seconds the node has to return a result before the job is reassigned. */
  deadlineSeconds: number;
}

export interface JobResultRequest {
  output: string;
  /** What the node's runtime reported. Informational only; payment uses the coordinator's count. */
  reported: { promptTokens: number; completionTokens: number; durationMs: number };
}

export interface JobResultResponse {
  accepted: boolean;
  reason?: string;
}

export const NODE_ROUTES = {
  hello: '/v1/node/hello',
  heartbeat: '/v1/node/heartbeat',
  result: (jobId: string) => `/v1/node/jobs/${encodeURIComponent(jobId)}/result`,
} as const;
