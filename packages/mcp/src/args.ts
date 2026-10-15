/**
 * The command line of `minera-mcp`.
 */

import { COORDINATORS, isNetworkKey, type NetworkKey } from '@minera/shared';

export const VERSION = '0.1.0';

export interface Options {
  network: NetworkKey;
  coordinator: string;
}

/** Reads the command line; returns a message for people instead when it cannot be used. */
export function parseArgs(argv: readonly string[]): Options | { message: string; code: number } {
  let network: NetworkKey = 'mainnet';
  let coordinator: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { message: 'Usage: minera-mcp [--network mainnet|testnet] [--coordinator <https url>]', code: 0 };
    }
    if (arg === '--version') return { message: VERSION, code: 0 };
    if (arg === '--network') {
      const value = argv[++i];
      if (!isNetworkKey(value)) return { message: '--network must be mainnet or testnet.', code: 64 };
      network = value;
    } else if (arg === '--coordinator') {
      const value = argv[++i] ?? '';
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return { message: '--coordinator must be a full https URL.', code: 64 };
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        return { message: '--coordinator must be an https URL without a user name or password.', code: 64 };
      }
      coordinator = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    } else {
      return { message: `Unknown option: ${arg}`, code: 64 };
    }
  }
  return { network, coordinator: coordinator ?? COORDINATORS[network].url };
}
