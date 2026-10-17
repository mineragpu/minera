/**
 * Pairing: a GPU machine hands its node address and deploy code to the Deploy page through the
 * coordinator, under a one-time code the page made. Nothing secret travels. The deploy code only
 * lets one operator wallet deploy this node, and the node key never leaves the machine.
 */

import type { GpuInfo, Hex } from './protocol.ts';
import type { Address } from './rewards.ts';

export const PAIRING_ROUTES = {
  create: '/v1/pairings',
  view: (code: string) => `/v1/pairings/${encodeURIComponent(code)}`,
} as const;

/** 128 random bits as 32 lowercase hexadecimal characters. Whoever holds the code can read the pairing. */
export const PAIRING_CODE_PATTERN = /^[0-9a-f]{32}$/;

/** How long a pairing waits for its rig to be deployed. */
export const PAIRING_TTL_SECONDS = 6 * 60 * 60;

/** What the machine reports about its card; the model and memory are shown on the Deploy page. */
export type PairingGpu = Pick<GpuInfo, 'model' | 'vramMb'>;

/** `POST /v1/pairings`, sent by `rig pair` on the GPU machine. */
export interface PairingRequest {
  code: string;
  nodeAddress: Address;
  operator: Address;
  deployCode: Hex;
  gpu: PairingGpu | null;
  clientVersion: string;
}

/** `GET /v1/pairings/:code`, read by the Deploy page. */
export interface PairingView {
  code: string;
  nodeAddress: Address;
  operator: Address;
  deployCode: Hex;
  gpu: PairingGpu | null;
  clientVersion: string;
  pairedAt: string;
  expiresAt: string;
}
