/**
 * The life of a paid rental, one step per tick: find and launch a machine, wait for it to pair with
 * the Deploy page, run the rental's time, shut the machine down. Whatever the renter paid for and
 * did not get is refunded. Every step is safe to repeat after a restart.
 */

import { BRAND } from '@minera/shared';
import type { RentalRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { MarketError } from './market.ts';
import { processRefunds, type RefundWallet } from './refunds.ts';
import { PAYMENT_GRACE_MS, refundOf, type RentalDeps, type RentalService } from './service.ts';

/** Machines launched for one rental before it is refunded. */
export const MAX_LAUNCHES = 3;
/** How long a paid rental waits for a machine within the price cap before it is refunded. */
export const FIND_MACHINE_MS = 30 * 60_000;
/** How long a running machine may stay stopped or offline before the rental fails. */
export const DOWN_GRACE_MS = 15 * 60_000;
/** A payment transaction the chain still does not know after this long is dropped. */
export const UNKNOWN_PAYMENT_MS = 30 * 60_000;
const SWEEP_MS = 10 * 60_000;
const BATCH = 25;

export const LABEL_PREFIX = 'minera-rental-';

/** The script a rented machine runs at start: the rig script, paired with the renter's Deploy page. */
export function onstartScript(rental: Pick<RentalRecord, 'id' | 'operator' | 'pairingCode'>, network: string): string {
  return [
    '#!/bin/bash',
    `# ${BRAND.name} rental ${rental.id}: set up the rig and pair it with the Deploy page.`,
    'mkdir -p /workspace && cd /workspace || exit 1',
    `curl -fsSL ${BRAND.links.site}/rig.sh -o rig.sh || exit 1`,
    `OPERATOR=${rental.operator} PAIR=${rental.pairingCode} NETWORK=${network} bash rig.sh >> /workspace/rig-setup.log 2>&1`,
    '',
  ].join('\n');
}

export interface RentalWorkerDeps extends RentalDeps {
  service: RentalService;
  wallet: RefundWallet;
}

/** What the renter paid for this rental and its applied extensions, at the quoted prices. */
async function paidTotal(store: Store, rental: RentalRecord): Promise<bigint> {
  const own = await store.rentals.byOperator(rental.operator, 200);
  return own
    .filter((other) => other.parentId === rental.id && other.status === 'applied')
    .reduce((sum, extension) => sum + extension.priceWei, rental.priceWei);
}

export function createRentalWorker(deps: RentalWorkerDeps) {
  const { store, config, market, log } = deps;
  const downSince = new Map<string, number>();
  let lastSweep = 0;

  const save = (rental: RentalRecord, now: Date, changes: Partial<RentalRecord>) =>
    store.rentals.save({ ...rental, ...changes, updatedAt: now });

  async function destroy(rental: RentalRecord): Promise<void> {
    if (rental.instanceId !== null) await market.destroy(rental.instanceId);
  }

  /** Refunds what is left of a rental and marks it failed. */
  async function fail(rental: RentalRecord, now: Date, note: string): Promise<void> {
    const total = await paidTotal(store, rental);
    let refund = total;
    if (rental.startedAt !== null && rental.endsAt !== null) {
      const span = BigInt(Math.max(1, rental.endsAt.getTime() - rental.startedAt.getTime()));
      const left = BigInt(Math.max(0, rental.endsAt.getTime() - now.getTime()));
      refund = (total * left) / span;
    }
    await store.transaction(async (tx) => {
      await tx.rentals.save({ ...rental, status: 'failed', note, updatedAt: now });
      if (refund > 0n && rental.payer !== null) {
        await tx.rentals.addRefund(refundOf(rental, rental.payer, refund, 'unused', now));
      }
    });
    log.warn({ rental: rental.id, refund: refund.toString(), note }, 'rental failed');
  }

  async function settleQuotes(now: Date): Promise<void> {
    for (const rental of await store.rentals.inStatus(['quoted'], BATCH)) {
      if (rental.payTx !== null) {
        try {
          const paid = await deps.service.pay(rental, rental.payTx, now);
          if (paid === null && now.getTime() - rental.updatedAt.getTime() > UNKNOWN_PAYMENT_MS) {
            const known = await deps.payments.transaction(rental.payTx);
            if (known === null) await save(rental, now, { payTx: null });
          }
        } catch (error) {
          log.info({ rental: rental.id, reason: error instanceof Error ? error.message : 'unknown' }, 'rental payment not accepted');
        }
        continue;
      }
      if (now.getTime() > rental.quoteExpiresAt.getTime() + PAYMENT_GRACE_MS) {
        await save(rental, now, { status: 'expired', note: 'The quote expired before it was paid.' });
      }
    }
  }

  async function applyExtensions(now: Date): Promise<void> {
    for (const extension of await store.rentals.inStatus(['paid'], BATCH)) {
      if (extension.parentId === null) continue;
      await store.transaction(async (tx) => {
        const parent = await tx.rentals.get(extension.parentId ?? '');
        if (parent && ['paid', 'starting', 'running'].includes(parent.status)) {
          const extra = extension.units * config.unitSeconds * 1000;
          await tx.rentals.save({
            ...parent,
            units: parent.units + extension.units,
            endsAt: parent.endsAt === null ? null : new Date(parent.endsAt.getTime() + extra),
            updatedAt: now,
          });
          await tx.rentals.save({ ...extension, status: 'applied', note: 'Added to the rental.', updatedAt: now });
        } else if (extension.payer !== null) {
          await tx.rentals.save({
            ...extension,
            status: 'failed',
            note: 'The rental this extends is no longer running, so the payment is being refunded.',
            updatedAt: now,
          });
          await tx.rentals.addRefund(refundOf(extension, extension.payer, extension.priceWei, 'unused', now));
        }
      });
    }
  }

  async function launch(now: Date): Promise<void> {
    for (const rental of await store.rentals.inStatus(['paid'], BATCH)) {
      if (rental.parentId !== null) continue;
      if (rental.attempts >= MAX_LAUNCHES) {
        await fail(rental, now, 'No machine could be started. The payment is being refunded.');
        continue;
      }
      const waitingSince = (rental.launchedAt ?? rental.paidAt ?? rental.updatedAt).getTime();
      const offer = await market.cheapestOffer();
      if (offer === null) {
        if (now.getTime() - waitingSince > FIND_MACHINE_MS) {
          await fail(rental, now, 'No machine within the price cap was free. The payment is being refunded.');
        }
        continue;
      }
      const pairingCode = deps.newId();
      const instanceId = await market.launch({
        offerId: offer.id,
        label: `${LABEL_PREFIX}${rental.id}`,
        onstart: onstartScript({ ...rental, pairingCode }, deps.network),
      });
      if (instanceId === null) continue;
      await save(rental, now, {
        status: 'starting',
        instanceId,
        gpu: offer.gpu,
        usdPerHourMicros: offer.usdPerHourMicros,
        launchedAt: now,
        attempts: rental.attempts + 1,
        pairingCode,
        note: `Starting a machine with a ${offer.gpu}. This takes 5 to 15 minutes.`,
      });
      log.info({ rental: rental.id, instanceId, gpu: offer.gpu }, 'rental machine launched');
    }
  }

  async function watchStarting(now: Date): Promise<void> {
    for (const rental of await store.rentals.inStatus(['starting'], BATCH)) {
      if (rental.instanceId === null) continue;
      if ((await store.pairings.get(rental.pairingCode, now)) !== null) {
        await save(rental, now, {
          status: 'running',
          startedAt: now,
          endsAt: new Date(now.getTime() + rental.units * config.unitSeconds * 1000),
          note: 'Machine connected. Deploy the rig on the Deploy page; the node starts on its own.',
        });
        log.info({ rental: rental.id }, 'rental machine paired');
        continue;
      }
      const machine = await market.machine(rental.instanceId);
      const late = now.getTime() - (rental.launchedAt ?? now).getTime() > config.startTimeoutSeconds * 1000;
      if (machine.state === 'failed' || machine.state === 'gone' || late) {
        await destroy(rental);
        await save(rental, now, {
          status: 'paid',
          instanceId: null,
          note: 'The machine did not start, so another one is being found.',
        });
        log.warn({ rental: rental.id, state: machine.state, late, message: machine.message }, 'rental machine replaced');
      }
    }
  }

  async function watchRunning(now: Date): Promise<void> {
    for (const rental of await store.rentals.inStatus(['running'], BATCH)) {
      if (rental.endsAt !== null && now >= rental.endsAt) {
        await destroy(rental);
        await save(rental, now, { status: 'ended', note: 'The rental ended and the machine was shut down.' });
        downSince.delete(rental.id);
        log.info({ rental: rental.id }, 'rental ended');
        continue;
      }
      if (rental.instanceId === null) continue;
      const machine = await market.machine(rental.instanceId);
      if (machine.state === 'running' || machine.state === 'starting') {
        downSince.delete(rental.id);
        continue;
      }
      const since = downSince.get(rental.id) ?? now.getTime();
      downSince.set(rental.id, since);
      if (machine.state === 'gone' || now.getTime() - since >= DOWN_GRACE_MS) {
        await destroy(rental);
        downSince.delete(rental.id);
        await fail(rental, now, 'The machine stopped. The unused time is being refunded.');
      }
    }
  }

  /** Destroys any machine on the account that no rental holds. */
  async function sweep(now: Date): Promise<void> {
    if (now.getTime() - lastSweep < SWEEP_MS) return;
    lastSweep = now.getTime();
    for (const machine of await market.labelled(LABEL_PREFIX)) {
      const rental = await store.rentals.get(machine.label.slice(LABEL_PREFIX.length));
      const held = rental !== null && ['starting', 'running'].includes(rental.status) && rental.instanceId === machine.instanceId;
      if (!held) {
        await market.destroy(machine.instanceId);
        log.warn({ instanceId: machine.instanceId, label: machine.label }, 'destroyed a machine no rental holds');
      }
    }
  }

  return {
    /** One pass over every rental; a marketplace that is busy only delays the steps that need it. */
    async step(now: Date): Promise<void> {
      await settleQuotes(now);
      await applyExtensions(now);
      for (const part of [launch, watchStarting, watchRunning, sweep]) {
        try {
          await part(now);
        } catch (error) {
          if (!(error instanceof MarketError)) throw error;
          log.warn({ reason: error.message, retryable: error.retryable }, 'the GPU marketplace step failed; trying again later');
        }
      }
      await processRefunds(store, deps.wallet, now, log);
    },
  };
}
