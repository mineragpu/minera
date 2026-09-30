import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, ChainConfig, Hex } from '@minera/shared';
import { burnPoolAbi } from '../chain/abi.ts';
import { chainDefinition, rpcTransport, type ChainClient } from '../chain/client.ts';
import type { Secret } from '../secret.ts';
import type { SettlementDraft } from '../store/records.ts';
import { SettlementGuardError } from './plan.ts';

export interface Publisher {
  /** The publisher key's address, lowercase. */
  address: Address;
  /** Check the release limit again, simulate, then send `publish`. Resolves the transaction hash. */
  send(draft: Pick<SettlementDraft, 'root' | 'total' | 'inputsDigest'>): Promise<Hex>;
}

export interface PublisherOptions {
  key: Secret<Hex>;
  chain: ChainConfig;
  rpcUrls: readonly string[];
  client: Pick<ChainClient, 'readContract' | 'simulateContract'>;
  pool: Address;
}

export function createPublisher(options: PublisherOptions): Publisher {
  const account = privateKeyToAccount(options.key.reveal());
  const wallet = createWalletClient({
    account,
    chain: chainDefinition(options.chain),
    transport: rpcTransport(options.rpcUrls),
  });
  const pool = options.pool;

  return {
    address: account.address.toLowerCase() as Address,
    async send(draft) {
      const cap = await options.client.readContract({ address: pool, abi: burnPoolAbi, functionName: 'releasable' });
      if (draft.total > cap) {
        throw new SettlementGuardError(`settlement total ${draft.total} is above the releasable ${cap}`);
      }
      const { request } = await options.client.simulateContract({
        account,
        address: pool,
        abi: burnPoolAbi,
        functionName: 'publish',
        args: [draft.root, draft.total, draft.inputsDigest],
      });
      return wallet.writeContract(request);
    },
  };
}
