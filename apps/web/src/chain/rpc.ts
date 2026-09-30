/**
 * The few JSON-RPC calls the site makes, always through the connected wallet's own provider. The
 * browser never calls a public RPC endpoint itself.
 */

import type { Address, Hex } from '@minera/shared';
import type { Eip1193Provider } from '../wallet/eip1193.ts';
import { parseChainId } from '../wallet/parse.ts';

interface CallRequest {
  from?: Address;
  to: Address;
  data: Hex;
}

export interface Receipt {
  status: 'success' | 'reverted';
  logs: { address: Address; topics: [Hex, ...Hex[]] | []; data: Hex }[];
}

const HEX = /^0x[0-9a-fA-F]*$/;
const FIRST_RECEIPT_POLL_MS = 1_500;
const MAX_RECEIPT_POLL_MS = 8_000;
const MAX_RECEIPT_FAILURES = 5;

function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && HEX.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function walletChainId(provider: Eip1193Provider): Promise<number | null> {
  return parseChainId(await provider.request({ method: 'eth_chainId' }));
}

/** `eth_call` at the latest block; a revert rejects with the wallet's error, revert data included. */
export async function call(provider: Eip1193Provider, request: CallRequest): Promise<Hex> {
  const result = await provider.request({ method: 'eth_call', params: [request, 'latest'] });
  if (!isHex(result)) throw new Error('The wallet returned a malformed call result.');
  return result;
}

export async function sendTransaction(provider: Eip1193Provider, request: Required<CallRequest>): Promise<Hex> {
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [request] });
  if (!isHex(hash) || hash.length !== 66) throw new Error('The wallet returned a malformed transaction hash.');
  return hash;
}

function parseReceipt(value: unknown): Receipt | null {
  if (!isRecord(value) || !Array.isArray(value.logs)) return null;
  const logs: Receipt['logs'] = [];
  for (const log of value.logs as unknown[]) {
    if (!isRecord(log) || !isHex(log.address) || !isHex(log.data) || !Array.isArray(log.topics)) continue;
    const topics = (log.topics as unknown[]).filter(isHex);
    logs.push({ address: log.address as Address, data: log.data, topics: topics as Receipt['logs'][number]['topics'] });
  }
  return { status: value.status === '0x1' ? 'success' : 'reverted', logs };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Polls the wallet for the receipt until the transaction is included, or `signal` aborts. */
export async function waitForReceipt(provider: Eip1193Provider, hash: Hex, signal: AbortSignal): Promise<Receipt> {
  let delay = FIRST_RECEIPT_POLL_MS;
  let failures = 0;
  for (;;) {
    signal.throwIfAborted();
    try {
      const receipt = parseReceipt(await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }));
      if (receipt) return receipt;
      failures = 0;
    } catch (cause) {
      // The transaction is already out; a brief wallet or network hiccup should not end the wait.
      failures += 1;
      if (failures >= MAX_RECEIPT_FAILURES) throw cause;
    }
    await wait(delay, signal);
    delay = Math.min(MAX_RECEIPT_POLL_MS, Math.round(delay * 1.5));
  }
}
