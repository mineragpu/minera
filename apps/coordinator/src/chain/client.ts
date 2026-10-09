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

export interface Endpoint {
  url: string;
  /** HTTP basic auth, when the configured URL carried `user:password@`. */
  authorization?: string;
}

/**
 * Moves `user:password@` credentials out of an endpoint URL into a basic auth header, so they are
 * sent the way providers expect and never travel in the URL or show in an error message.
 */
export function endpoint(url: string): Endpoint {
  const parsed = new URL(url);
  if (parsed.username === '' && parsed.password === '') return { url };
  const credentials = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
  parsed.username = '';
  parsed.password = '';
  return { url: parsed.href, authorization: `Basic ${Buffer.from(credentials).toString('base64')}` };
}

/** Tries each endpoint in order and moves to the next when one fails or times out. */
export function rpcTransport(urls: readonly string[]): Transport {
  return fallback(
    urls.map((configured) => {
      const { url, authorization } = endpoint(configured);
      const fetchOptions = authorization ? { headers: { Authorization: authorization } } : undefined;
      return http(url, { timeout: 15_000, retryCount: 1, fetchOptions });
    }),
    { retryCount: 1 },
  );
}

export function createChainClient(chain: ChainConfig, rpcUrls: readonly string[]): ChainClient {
  return createPublicClient({ chain: chainDefinition(chain), transport: rpcTransport(rpcUrls) });
}
