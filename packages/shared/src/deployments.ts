/**
 * Deployed contract addresses per chain, for the coordinator and the web app.
 *
 * The contracts workspace writes `packages/contracts/deployments/<chainId>.json` when it deploys;
 * `deployments.test.ts` fails if this module drifts from those files.
 */

import type { Address } from './rewards.ts';

export interface Deployment {
  chainId: number;
  /** First L2 block that can contain our events, for indexers. */
  startBlock: number;
  guardian: Address;
  publisher: Address;
  burnPool: Address;
  rigRegistry: Address;
  pairZap: Address;
}

export const DEPLOYMENTS: Readonly<Record<number, Deployment>> = {
  46630: {
    chainId: 46630,
    startBlock: 125_997_924,
    guardian: '0xe6580E40a294F2b3b99E76c4862eF43987A6151A',
    publisher: '0xB677A0A954dBb26A0Fd7ec874d1c232D56e2c98A',
    burnPool: '0xcc31Debc633c9F482E37213B975D3671Fd05a1f9',
    rigRegistry: '0xa9f0BaB0AE7cc4A7B605D831d57A3A2a0E7921D8',
    pairZap: '0xbe078e15cF90c21Bf23BCFBE94DBC9E44ceFd4d1',
  },
};

export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId];
}
