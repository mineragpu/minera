import type { Address, Hex } from '@minera/shared';
import type { Queryable } from '../../db/client.ts';
import type { RefundReason, RefundRecord, RefundStatus, RentalRecord, RentalStatus } from '../records.ts';
import type { RentalStore } from '../store.ts';
import { toBigInt } from './convert.ts';

interface RentalRow {
  id: string;
  parent_id: string | null;
  operator: string;
  units: number;
  price_wei: string;
  usd_micros: string;
  eth_usd_micros: string;
  quote_expires_at: Date;
  status: string;
  pay_tx: string | null;
  payer: string | null;
  paid_wei: string | null;
  paid_at: Date | null;
  instance_id: string | null;
  gpu: string | null;
  usd_per_hour_micros: string | null;
  launched_at: Date | null;
  attempts: number;
  pairing_code: string;
  started_at: Date | null;
  ends_at: Date | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RefundRow {
  id: string;
  rental_id: string;
  recipient: string;
  wei: string;
  reason: string;
  raw_tx: string | null;
  tx_hash: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

const optionalBigInt = (value: string | null): bigint | null => (value === null ? null : toBigInt(value));
const optionalText = (value: bigint | null): string | null => (value === null ? null : value.toString());

function toRental(row: RentalRow): RentalRecord {
  return {
    id: row.id,
    parentId: row.parent_id,
    operator: row.operator as Address,
    units: row.units,
    priceWei: toBigInt(row.price_wei),
    usdMicros: toBigInt(row.usd_micros),
    ethUsdMicros: toBigInt(row.eth_usd_micros),
    quoteExpiresAt: row.quote_expires_at,
    status: row.status as RentalStatus,
    payTx: row.pay_tx as Hex | null,
    payer: row.payer as Address | null,
    paidWei: optionalBigInt(row.paid_wei),
    paidAt: row.paid_at,
    instanceId: row.instance_id,
    gpu: row.gpu,
    usdPerHourMicros: optionalBigInt(row.usd_per_hour_micros),
    launchedAt: row.launched_at,
    attempts: row.attempts,
    pairingCode: row.pairing_code,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRefund(row: RefundRow): RefundRecord {
  return {
    id: row.id,
    rentalId: row.rental_id,
    recipient: row.recipient as Address,
    wei: toBigInt(row.wei),
    reason: row.reason as RefundReason,
    rawTx: row.raw_tx as Hex | null,
    txHash: row.tx_hash as Hex | null,
    status: row.status as RefundStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function postgresRentals(db: Queryable): RentalStore {
  return {
    async create(record) {
      const inserted = await db`
        INSERT INTO rentals (
          id, parent_id, operator, units, price_wei, usd_micros, eth_usd_micros, quote_expires_at, status,
          pay_tx, payer, paid_wei, paid_at, instance_id, gpu, usd_per_hour_micros, launched_at, attempts,
          pairing_code, started_at, ends_at, note, created_at, updated_at
        ) VALUES (
          ${record.id}, ${record.parentId}, ${record.operator}, ${record.units}, ${record.priceWei.toString()},
          ${record.usdMicros.toString()}, ${record.ethUsdMicros.toString()}, ${record.quoteExpiresAt},
          ${record.status}, ${record.payTx}, ${record.payer}, ${optionalText(record.paidWei)}, ${record.paidAt},
          ${record.instanceId}, ${record.gpu}, ${optionalText(record.usdPerHourMicros)}, ${record.launchedAt},
          ${record.attempts}, ${record.pairingCode}, ${record.startedAt}, ${record.endsAt}, ${record.note},
          ${record.createdAt}, ${record.updatedAt}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
      `;
      return inserted.length === 1;
    },

    async get(id) {
      const [row] = await db<RentalRow[]>`SELECT * FROM rentals WHERE id = ${id}`;
      return row ? toRental(row) : null;
    },

    async save(record) {
      const updated = await db`
        UPDATE rentals SET
          units = ${record.units},
          status = ${record.status},
          pay_tx = ${record.payTx},
          payer = ${record.payer},
          paid_wei = ${optionalText(record.paidWei)},
          paid_at = ${record.paidAt},
          instance_id = ${record.instanceId},
          gpu = ${record.gpu},
          usd_per_hour_micros = ${optionalText(record.usdPerHourMicros)},
          launched_at = ${record.launchedAt},
          attempts = ${record.attempts},
          started_at = ${record.startedAt},
          ends_at = ${record.endsAt},
          note = ${record.note},
          updated_at = ${record.updatedAt}
        WHERE id = ${record.id}
      `;
      if (updated.count !== 1) throw new Error(`there is no rental ${record.id}`);
    },

    async byOperator(operator, limit) {
      const rows = await db<RentalRow[]>`
        SELECT * FROM rentals WHERE operator = ${operator} ORDER BY created_at DESC LIMIT ${limit}
      `;
      return rows.map(toRental);
    },

    async inStatus(statuses, limit) {
      const rows = await db<RentalRow[]>`
        SELECT * FROM rentals WHERE status = ANY(${[...statuses]}::text[]) ORDER BY created_at ASC LIMIT ${limit}
      `;
      return rows.map(toRental);
    },

    async byPayment(txHash) {
      const [row] = await db<RentalRow[]>`SELECT * FROM rentals WHERE pay_tx = ${txHash}`;
      return row ? toRental(row) : null;
    },

    async countActive() {
      const [row] = await db<{ count: string }[]>`
        SELECT count(*) AS count FROM rentals
        WHERE parent_id IS NULL AND status IN ('paid', 'starting', 'running')
      `;
      return Number(row?.count ?? 0);
    },

    async countOpenQuotes(operator, now) {
      const [row] = await db<{ count: string }[]>`
        SELECT count(*) AS count FROM rentals
        WHERE operator = ${operator} AND status = 'quoted' AND quote_expires_at > ${now}
      `;
      return Number(row?.count ?? 0);
    },

    async addRefund(refund) {
      const inserted = await db`
        INSERT INTO rental_refunds (id, rental_id, recipient, wei, reason, raw_tx, tx_hash, status, created_at, updated_at)
        VALUES (
          ${refund.id}, ${refund.rentalId}, ${refund.recipient}, ${refund.wei.toString()}, ${refund.reason},
          ${refund.rawTx}, ${refund.txHash}, ${refund.status}, ${refund.createdAt}, ${refund.updatedAt}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
      `;
      return inserted.length === 1;
    },

    async saveRefund(refund) {
      const updated = await db`
        UPDATE rental_refunds SET
          raw_tx = ${refund.rawTx},
          tx_hash = ${refund.txHash},
          status = ${refund.status},
          updated_at = ${refund.updatedAt}
        WHERE id = ${refund.id}
      `;
      if (updated.count !== 1) throw new Error(`there is no refund ${refund.id}`);
    },

    async refundsFor(rentalId) {
      const rows = await db<RefundRow[]>`
        SELECT * FROM rental_refunds WHERE rental_id = ${rentalId} ORDER BY created_at ASC
      `;
      return rows.map(toRefund);
    },

    async openRefunds(limit) {
      const rows = await db<RefundRow[]>`
        SELECT * FROM rental_refunds WHERE status <> 'done' ORDER BY created_at ASC LIMIT ${limit}
      `;
      return rows.map(toRefund);
    },
  };
}
