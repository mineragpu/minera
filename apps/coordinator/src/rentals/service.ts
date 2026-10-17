/**
 * Renting a GPU machine: quotes, payments and what the Deploy page shows. The machine's life after
 * the payment, from launch to shutdown, is the worker's (`worker.ts`).
 */

import {
  RENTAL_PACKAGES,
  type Address,
  type Hex,
  type NetworkKey,
  type RentalOfferView,
  type RentalView,
} from '@minera/shared';
import type { RentalConfig } from '../config.ts';
import type { RefundReason, RefundRecord, RentalRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import type { GpuMarket, MarketOffer } from './market.ts';
import { checkPayment, paymentData, type PaymentReader } from './payment.ts';
import { formatUsd, rentalUsdMicros, usdToWei } from './price.ts';

/** A payment mined this long after its quote expired is still accepted. */
export const PAYMENT_GRACE_MS = 10 * 60_000;
/** Unpaid quotes one operator may hold at once. */
export const MAX_OPEN_QUOTES = 3;
const OFFER_TTL_MS = 60_000;

/** The few log calls rentals make, so the server can hand them its logger before the app is built. */
export interface RentalLog {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

export interface RentalDeps {
  store: Store;
  config: RentalConfig;
  network: NetworkKey;
  market: GpuMarket;
  ethUsd: () => Promise<bigint>;
  payments: PaymentReader;
  /** 128 random bits as 32 lowercase hexadecimal characters. */
  newId: () => string;
  log: RentalLog;
}

export class RentalError extends Error {
  override name = 'RentalError';
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function refundOf(rental: RentalRecord, recipient: Address, wei: bigint, reason: RefundReason, now: Date): RefundRecord {
  return {
    id: `${rental.id}:${reason}`,
    rentalId: rental.id,
    recipient,
    wei,
    reason,
    rawTx: null,
    txHash: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

export async function toView(store: Store, config: RentalConfig, rental: RentalRecord): Promise<RentalView> {
  const refunds = await store.rentals.refundsFor(rental.id);
  const launched = rental.status === 'starting' || rental.status === 'running';
  return {
    id: rental.id,
    parentId: rental.parentId,
    operator: rental.operator,
    units: rental.units,
    unitSeconds: config.unitSeconds,
    priceWei: rental.priceWei.toString(),
    usd: formatUsd(rental.usdMicros),
    status: rental.status,
    payment:
      rental.status === 'quoted'
        ? {
            to: config.payTo,
            value: rental.priceWei.toString(),
            data: paymentData(rental.id),
            expiresAt: rental.quoteExpiresAt.toISOString(),
          }
        : null,
    payTx: rental.payTx,
    paidAt: rental.paidAt?.toISOString() ?? null,
    gpu: rental.gpu,
    pairingCode: launched ? rental.pairingCode : null,
    startedAt: rental.startedAt?.toISOString() ?? null,
    endsAt: rental.endsAt?.toISOString() ?? null,
    note: rental.note,
    createdAt: rental.createdAt.toISOString(),
    refunds: refunds.map((refund) => ({
      wei: refund.wei.toString(),
      reason: refund.reason,
      status: refund.status,
      txHash: refund.status === 'pending' ? null : refund.txHash,
    })),
  };
}

export interface RentalService {
  offer(now: Date): Promise<RentalOfferView>;
  create(request: { operator: Address; units: number; parentId: string | null }, now: Date): Promise<RentalRecord>;
  /**
   * Checks the payment and records it. While the transaction is not mined it is kept on the rental
   * and the result is null; the worker finishes the check.
   */
  pay(rental: RentalRecord, txHash: Hex, now: Date): Promise<RentalRecord | null>;
}

export function createRentalService(deps: RentalDeps): RentalService {
  const { store, config, market } = deps;
  let cachedOffer: { at: number; offer: MarketOffer | null } | null = null;

  async function currentOffer(now: Date): Promise<MarketOffer | null> {
    if (cachedOffer && now.getTime() - cachedOffer.at < OFFER_TTL_MS) return cachedOffer.offer;
    const offer = await market.cheapestOffer();
    cachedOffer = { at: now.getTime(), offer };
    return offer;
  }

  async function price(offer: MarketOffer, units: number): Promise<{ usdMicros: bigint; ethUsdMicros: bigint; wei: bigint }> {
    const ethUsdMicros = await deps.ethUsd();
    const usdMicros = rentalUsdMicros(offer.usdPerHourMicros, units, config.unitSeconds, config.marginBps);
    return { usdMicros, ethUsdMicros, wei: usdToWei(usdMicros, ethUsdMicros) };
  }

  return {
    async offer(now) {
      const [offer, active] = await Promise.all([currentOffer(now), store.rentals.countActive()]);
      const base = { unitSeconds: config.unitSeconds, payTo: config.payTo, quoteSeconds: config.quoteSeconds };
      if (offer === null) {
        return { ...base, available: false, reason: 'No machine is on offer within the price cap right now.', gpu: null, packages: [], ethUsd: '0' };
      }
      const priced = await Promise.all(RENTAL_PACKAGES.map(async (units) => ({ units, ...(await price(offer, units)) })));
      const ethUsd = priced[0]?.ethUsdMicros ?? 0n;
      const full = active >= config.maxActive;
      return {
        ...base,
        available: !full,
        reason: full ? 'Every rental slot is taken right now. Try again later.' : null,
        gpu: { model: offer.gpu, vramMb: offer.vramMb },
        packages: priced.map((entry) => ({ units: entry.units, usd: formatUsd(entry.usdMicros), wei: entry.wei.toString() })),
        ethUsd: formatUsd(ethUsd),
      };
    },

    async create(request, now) {
      if (!(RENTAL_PACKAGES as readonly number[]).includes(request.units)) {
        throw new RentalError(400, 'invalid_package', `A rental is ${RENTAL_PACKAGES.join(', ')} units long.`);
      }
      if (request.parentId !== null) {
        const parent = await store.rentals.get(request.parentId);
        if (!parent || parent.parentId !== null || parent.operator !== request.operator) {
          throw new RentalError(404, 'rental_not_found', 'There is no rental with this id for this wallet.');
        }
        if (!['paid', 'starting', 'running'].includes(parent.status)) {
          throw new RentalError(409, 'rental_not_active', 'Only a rental that is paid or running can be extended.');
        }
      } else if ((await store.rentals.countActive()) >= config.maxActive) {
        throw new RentalError(409, 'no_slot', 'Every rental slot is taken right now. Try again later.');
      }
      if ((await store.rentals.countOpenQuotes(request.operator, now)) >= MAX_OPEN_QUOTES) {
        throw new RentalError(429, 'too_many_quotes', 'This wallet has unpaid quotes open. Pay one, or wait for them to expire.');
      }
      const offer = await currentOffer(now);
      if (offer === null) throw new RentalError(503, 'no_machine', 'No machine is on offer within the price cap right now.');
      const quote = await price(offer, request.units);
      const rental: RentalRecord = {
        id: deps.newId(),
        parentId: request.parentId,
        operator: request.operator,
        units: request.units,
        priceWei: quote.wei,
        usdMicros: quote.usdMicros,
        ethUsdMicros: quote.ethUsdMicros,
        quoteExpiresAt: new Date(now.getTime() + config.quoteSeconds * 1000),
        status: 'quoted',
        payTx: null,
        payer: null,
        paidWei: null,
        paidAt: null,
        instanceId: null,
        gpu: null,
        usdPerHourMicros: null,
        launchedAt: null,
        attempts: 0,
        pairingCode: deps.newId(),
        startedAt: null,
        endsAt: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      };
      if (!(await store.rentals.create(rental))) throw new RentalError(500, 'internal_error', 'Could not save the quote.');
      return rental;
    },

    async pay(rental, txHash, now) {
      if (rental.payer !== null) {
        if (rental.payTx === txHash) return rental;
        throw new RentalError(409, 'already_paid', 'This rental was paid with another transaction.');
      }
      const owner = await store.rentals.byPayment(txHash);
      if (owner !== null && owner.id !== rental.id) {
        throw new RentalError(409, 'payment_used', 'This transaction already paid for another rental.');
      }

      const check = await checkPayment(deps.payments, txHash, config.payTo, rental.id);
      if (check.kind === 'pending') {
        // Kept so the worker can finish the check if the page is closed before the transaction lands.
        if (rental.payTx !== txHash) await store.rentals.save({ ...rental, payTx: txHash, updatedAt: now });
        return null;
      }
      if (check.kind === 'invalid') {
        if (rental.payTx === txHash) await store.rentals.save({ ...rental, payTx: null, updatedAt: now });
        throw new RentalError(400, 'invalid_payment', check.reason);
      }

      return store.transaction(async (tx) => {
        const fresh = await tx.rentals.get(rental.id);
        if (!fresh) throw new RentalError(404, 'rental_not_found', 'There is no rental with this id.');
        if (fresh.payer !== null) return fresh;
        const paid: RentalRecord = {
          ...fresh,
          payTx: txHash,
          payer: check.payer,
          paidWei: check.value,
          paidAt: check.at,
          updatedAt: now,
        };
        const late = check.at.getTime() > fresh.quoteExpiresAt.getTime() + PAYMENT_GRACE_MS;
        const short = check.value < fresh.priceWei;
        let parentGone = false;
        if (fresh.parentId !== null) {
          const parent = await tx.rentals.get(fresh.parentId);
          parentGone = !parent || !['paid', 'starting', 'running'].includes(parent.status);
        }
        if (late || short || parentGone) {
          const reason: RefundReason = short ? 'short' : 'late';
          await tx.rentals.save({
            ...paid,
            status: 'expired',
            note: short
              ? 'The payment was less than the price, so it is being refunded.'
              : parentGone
                ? 'The rental this extends is no longer running, so the payment is being refunded.'
                : 'The payment arrived after the quote expired, so it is being refunded.',
          });
          await tx.rentals.addRefund(refundOf(fresh, check.payer, check.value, reason, now));
        } else {
          await tx.rentals.save({ ...paid, status: 'paid', note: 'Payment confirmed. Finding a machine.' });
          if (check.value > fresh.priceWei) {
            await tx.rentals.addRefund(refundOf(fresh, check.payer, check.value - fresh.priceWei, 'excess', now));
          }
        }
        const saved = await tx.rentals.get(fresh.id);
        if (!saved) throw new RentalError(500, 'internal_error', 'Could not save the payment.');
        deps.log.info({ rental: fresh.id, txHash, status: saved.status }, 'rental payment recorded');
        return saved;
      });
    },
  };
}
