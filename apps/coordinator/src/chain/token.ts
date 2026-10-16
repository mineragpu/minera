import type { Address, TokenSupplyRules } from '@minera/shared';
import { erc20Abi } from 'viem';
import type { ChainClient } from './client.ts';

/** The token's supply as of one block, every balance read at that same block. */
export interface TokenSupplySnapshot {
  blockNumber: bigint;
  /** That block's timestamp in unix seconds. */
  timestamp: bigint;
  /** `totalSupply()`: everything ever minted, burned tokens included. */
  minted: bigint;
  /** What the burn addresses hold. */
  burned: bigint;
  /** What each non-circulating wallet holds. */
  held: { address: Address; label: string; balance: bigint }[];
}

/** The last supply read from the chain; the routes serve it without touching the RPC. */
export interface TokenView {
  current(): TokenSupplySnapshot | null;
}

export interface TokenWatcher extends TokenView {
  refresh(): Promise<TokenSupplySnapshot>;
}

export type TokenReader = Pick<ChainClient, 'getBlock' | 'readContract'>;

export async function readTokenSupply(client: TokenReader, token: Address, rules: TokenSupplyRules): Promise<TokenSupplySnapshot> {
  const block = await client.getBlock({ blockTag: 'latest' });
  const at = { address: token, abi: erc20Abi, blockNumber: block.number } as const;
  const balanceOf = (account: Address) => client.readContract({ ...at, functionName: 'balanceOf', args: [account] });
  const [minted, burnBalances, heldBalances] = await Promise.all([
    client.readContract({ ...at, functionName: 'totalSupply' }),
    Promise.all(rules.burnAddresses.map(balanceOf)),
    Promise.all(rules.nonCirculating.map((wallet) => balanceOf(wallet.address))),
  ]);
  return {
    blockNumber: block.number,
    timestamp: block.timestamp,
    minted,
    burned: burnBalances.reduce((sum, balance) => sum + balance, 0n),
    held: rules.nonCirculating.map((wallet, i) => ({ ...wallet, balance: heldBalances[i] ?? 0n })),
  };
}

export function createTokenWatcher(read: () => Promise<TokenSupplySnapshot>): TokenWatcher {
  let latest: TokenSupplySnapshot | null = null;
  return {
    current: () => latest,
    async refresh() {
      const snapshot = await read();
      if (!latest || snapshot.blockNumber >= latest.blockNumber) latest = snapshot;
      return snapshot;
    },
  };
}
