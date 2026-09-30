import { addChainParameter, type ChainConfig } from '@minera/shared';
import type { Eip1193Provider } from './eip1193.ts';
import { ERROR_CODES, errorCode } from './errors.ts';

/**
 * Moves the wallet to `chain` (EIP-3326). A wallet that does not know the chain yet answers 4902;
 * it is then offered the chain's parameters (EIP-3085) and asked to switch again.
 */
export async function switchToChain(provider: Eip1193Provider, chain: ChainConfig): Promise<void> {
  const target = [{ chainId: chain.hexId }];
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: target });
  } catch (error) {
    if (errorCode(error) !== ERROR_CODES.unrecognizedChain) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [addChainParameter(chain)] });
    // Adding a chain does not switch to it in every wallet.
    await provider.request({ method: 'wallet_switchEthereumChain', params: target });
  }
}
