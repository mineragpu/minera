/**
 * The networks the contracts are deployed to, and the parameters a browser wallet needs to reach
 * them.
 *
 * The chain name is shown to users only where they must see it to connect: the network badge and
 * the switch-network prompt.
 */

export type NetworkKey = 'testnet' | 'mainnet';

export type HexChainId = `0x${string}`;

export interface NativeCurrency {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface ChainConfig {
  readonly network: NetworkKey;
  readonly id: number;
  readonly hexId: HexChainId;
  readonly name: string;
  readonly nativeCurrency: NativeCurrency;
  /** The first entry is the primary endpoint; the rest are fallbacks, in order. */
  readonly rpcUrls: readonly string[];
  readonly explorerUrl: string;
}

/** The parameters of `wallet_addEthereumChain` (EIP-3085). */
export interface AddEthereumChainParameter {
  chainId: HexChainId;
  chainName: string;
  nativeCurrency: NativeCurrency;
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

const ETHER: NativeCurrency = { name: 'Ether', symbol: 'ETH', decimals: 18 };

export const CHAINS: Readonly<Record<NetworkKey, ChainConfig>> = {
  testnet: {
    network: 'testnet',
    id: 46630,
    hexId: '0xb626',
    name: 'Robinhood Chain Testnet',
    nativeCurrency: ETHER,
    rpcUrls: [
      'https://rpc.testnet.chain.robinhood.com',
      'https://robinhood-sepolia-rpc.publicnode.com',
      'https://robinhood-testnet.drpc.org',
    ],
    explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
  },
  mainnet: {
    network: 'mainnet',
    id: 4663,
    hexId: '0x1237',
    name: 'Robinhood Chain',
    nativeCurrency: ETHER,
    rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
    explorerUrl: 'https://robinhoodchain.blockscout.com',
  },
};

/** The network goes live on testnet first. */
export const DEFAULT_NETWORK: NetworkKey = 'testnet';

export function isNetworkKey(value: unknown): value is NetworkKey {
  return value === 'testnet' || value === 'mainnet';
}

export function addChainParameter(chain: ChainConfig): AddEthereumChainParameter {
  return {
    chainId: chain.hexId,
    chainName: chain.name,
    nativeCurrency: { ...chain.nativeCurrency },
    rpcUrls: [...chain.rpcUrls],
    blockExplorerUrls: [chain.explorerUrl],
  };
}
