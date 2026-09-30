import { createPublicClient, defineChain, fallback, http, type Chain, type PublicClient, type Transport } from 'viem';
import type { ChainConfig } from '@minera/shared';

export type ChainClient = PublicClient<Transport, Chain>;

export function chainDefinition(config: ChainConfig): Chain {
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [...config.rpcUrls] } },
    blockExplorers: { default: { name: 'explorer', url: config.explorerUrl } },
  });
}

/** Tries each endpoint in order and moves to the next when one fails or times out. */
export function rpcTransport(urls: readonly string[]): Transport {
  return fallback(
    urls.map((url) => http(url, { timeout: 15_000, retryCount: 1 })),
    { retryCount: 1 },
  );
}

export function createChainClient(chain: ChainConfig, rpcUrls: readonly string[]): ChainClient {
  return createPublicClient({ chain: chainDefinition(chain), transport: rpcTransport(rpcUrls) });
}
