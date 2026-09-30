import type { Address, Hex } from '@minera/shared';
import { getAddress } from 'viem';

export const NAME_MAX_BYTES = 32;

const encoder = new TextEncoder();

/** The first 0x token in a paste, so a whole printed line such as "Deploy code: 0x…" also works. */
function hexToken(input: string): string | null {
  return /0x[0-9a-fA-F]+/.exec(input)?.[0] ?? null;
}

export function parseNodeAddress(input: string): Address | null {
  const token = hexToken(input);
  return token && token.length === 42 ? getAddress(token.toLowerCase()) : null;
}

/** A deploy code is a 65-byte signature. */
export function parseDeployCode(input: string): Hex | null {
  const token = hexToken(input);
  return token && token.length === 132 ? (token as Hex) : null;
}

/** The name as it is sent: surrounding spaces removed. */
export function rigName(input: string): string {
  return input.trim();
}

/** The registry limits names by UTF-8 bytes, not characters. */
export function nameBytes(input: string): number {
  return encoder.encode(rigName(input)).length;
}

export function isValidName(input: string): boolean {
  const bytes = nameBytes(input);
  return bytes >= 1 && bytes <= NAME_MAX_BYTES;
}
