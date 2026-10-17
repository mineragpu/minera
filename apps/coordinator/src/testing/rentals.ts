/**
 * Stand-ins for the marketplace, the chain and the refund wallet, so the rental flow runs in tests
 * without any of them.
 */

import type { Address, Hex } from '@minera/shared';
import { loadConfig, type RentalConfig } from '../config.ts';
import type { GpuMarket, LaunchRequest, MachineState, MarketOffer } from '../rentals/market.ts';
import type { PaymentReader, PaymentTransaction } from '../rentals/payment.ts';
import type { RefundWallet } from '../rentals/refunds.ts';
import { createRentalService, type RentalDeps, type RentalLog } from '../rentals/service.ts';
import type { Store } from '../store/store.ts';

export const RENTAL_OPERATOR = '0x00000000000000000000000000000000000000aa' as Address;
export const RENTAL_PAYER = '0x00000000000000000000000000000000000000bb' as Address;
export const RENTAL_PAY_TO = '0x00000000000000000000000000000000000000cc' as Address;
/** $4,000 per ETH, in millionths of a dollar. */
export const ETH_USD_MICROS = 4_000_000_000n;

export const RENTAL_ENV = {
  RENTALS: 'on',
  RENTAL_MARKET_URL: 'https://market.example',
  RENTAL_MARKET_API_KEY: 'k'.repeat(32),
  RENTAL_MARKET_IMAGE: 'example/rig-base:cuda-12',
  RENTAL_PAY_TO: RENTAL_PAY_TO,
  RENTAL_REFUND_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  RENTAL_ETH_USD_SOURCES: JSON.stringify([{ url: 'https://price.example/eth', path: 'data.amount' }]),
} as const;

export function rentalConfig(env: Record<string, string> = {}): RentalConfig {
  const config = loadConfig({ DATABASE_URL: 'postgres://test@localhost/test', ...RENTAL_ENV, ...env });
  if (!config.rentals) throw new Error('rentals are off');
  return config.rentals;
}

export function fakeMarket() {
  const offers: MarketOffer[] = [{ id: '101', gpu: 'Example GPU', vramMb: 8192, usdPerHourMicros: 100_000n }];
  const launched: (LaunchRequest & { instanceId: string })[] = [];
  const machines = new Map<string, MachineState>();
  const destroyed: string[] = [];
  let next = 500;
  const market: GpuMarket = {
    async cheapestOffer() {
      return offers[0] ?? null;
    },
    async launch(request) {
      const instanceId = String(next++);
      launched.push({ ...request, instanceId });
      machines.set(instanceId, 'starting');
      return instanceId;
    },
    async machine(instanceId) {
      return { state: machines.get(instanceId) ?? 'gone', message: null };
    },
    async destroy(instanceId) {
      destroyed.push(instanceId);
      machines.delete(instanceId);
    },
    async labelled(prefix) {
      return launched
        .filter((machine) => machines.has(machine.instanceId) && machine.label.startsWith(prefix))
        .map((machine) => ({ instanceId: machine.instanceId, label: machine.label }));
    },
  };
  return { market, offers, launched, machines, destroyed };
}

export function fakePayments() {
  const transactions = new Map<Hex, PaymentTransaction>();
  const receipts = new Map<Hex, { success: boolean; at: Date }>();
  const reader: PaymentReader = {
    async transaction(hash) {
      return transactions.get(hash) ?? null;
    },
    async receipt(hash) {
      return receipts.get(hash) ?? null;
    },
  };
  /** Records a transfer to the rental address; `at` null leaves it unmined. */
  function pay(hash: Hex, rentalId: string, value: bigint, at: Date | null, to: Address = RENTAL_PAY_TO): void {
    transactions.set(hash, { from: RENTAL_PAYER, to, value, input: `0x${rentalId}` });
    if (at !== null) receipts.set(hash, { success: true, at });
  }
  return { reader, transactions, receipts, pay };
}

export function fakeWallet() {
  const sent: Hex[] = [];
  const outcomes = new Map<Hex, boolean>();
  let signed = 0;
  const state = { balance: 10n ** 18n };
  const wallet: RefundWallet = {
    address: '0x00000000000000000000000000000000000000dd',
    async balance() {
      return state.balance;
    },
    async sign() {
      signed += 1;
      const hash = `0x${signed.toString(16).padStart(64, '0')}` as Hex;
      return { raw: `0x02${signed.toString(16).padStart(8, '0')}` as Hex, hash };
    },
    async broadcast(raw) {
      sent.push(raw);
    },
    async outcome(hash) {
      return outcomes.get(hash) ?? null;
    },
  };
  return { wallet, sent, outcomes, state };
}

export const quietLog: RentalLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** Ids 000…001, 000…002 and so on, so tests can name them. */
export function counterIds(): () => string {
  let count = 0;
  return () => (count += 1).toString(16).padStart(32, '0');
}

export function rentalDeps(store: Store, overrides: Partial<RentalDeps> = {}) {
  const market = fakeMarket();
  const payments = fakePayments();
  const deps: RentalDeps = {
    store,
    config: rentalConfig(),
    network: 'mainnet',
    market: market.market,
    ethUsd: async () => ETH_USD_MICROS,
    payments: payments.reader,
    newId: counterIds(),
    log: quietLog,
    ...overrides,
  };
  return { deps, market, payments, service: createRentalService(deps) };
}
