import { ETH_PAIR, type Address } from '@dayagpu/shared';
import { decodeFunctionResult, encodeFunctionData } from 'viem';
import type { Eip1193Provider } from '../wallet/eip1193.ts';
import { pairZapAbi, quoterAbi } from './abi.ts';
import { call } from './rpc.ts';

/** A stock claim accepts at most this much less than the quote: 1%. */
const SLIPPAGE_BPS = 100n;
const BPS = 10_000n;
const NO_HOOKS: Address = '0x0000000000000000000000000000000000000000';

export interface Quote {
  /** What the swap would deliver now, in the asset's smallest unit. */
  amountOut: bigint;
  /** The least the claim accepts, after slippage. */
  minOut: bigint;
}

/**
 * Prices swapping `amountIn` wei into `asset` along the zap's own route: the zap's fee and tick
 * spacing, native ETH in, no hooks. Both reads go through the wallet's provider.
 */
export async function quoteClaim(
  provider: Eip1193Provider,
  contracts: { pairZap: Address; quoter: Address },
  asset: Address,
  amountIn: bigint,
): Promise<Quote> {
  const routeData = await call(provider, {
    to: contracts.pairZap,
    data: encodeFunctionData({ abi: pairZapAbi, functionName: 'routeOf', args: [asset] }),
  });
  const route = decodeFunctionResult({ abi: pairZapAbi, functionName: 'routeOf', data: routeData });
  if (route.asset.toLowerCase() !== asset.toLowerCase()) throw new Error('The zap has no route for this asset.');

  const quoteData = await call(provider, {
    to: contracts.quoter,
    data: encodeFunctionData({
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          poolKey: { currency0: ETH_PAIR, currency1: asset, fee: route.fee, tickSpacing: route.tickSpacing, hooks: NO_HOOKS },
          zeroForOne: true,
          exactAmount: amountIn,
          hookData: '0x',
        },
      ],
    }),
  });
  const [amountOut] = decodeFunctionResult({ abi: quoterAbi, functionName: 'quoteExactInputSingle', data: quoteData });
  if (amountOut === 0n) throw new Error('The quote is empty.');
  return { amountOut, minOut: (amountOut * (BPS - SLIPPAGE_BPS)) / BPS };
}
