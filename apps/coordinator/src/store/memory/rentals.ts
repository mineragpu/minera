import type { RentalRecord } from '../records.ts';
import type { RentalStore } from '../store.ts';
import { copy, type StateBox } from './state.ts';

const ACTIVE = new Set(['paid', 'starting', 'running']);

const oldestFirst = <T extends { createdAt: Date }>(a: T, b: T): number => a.createdAt.getTime() - b.createdAt.getTime();

function paymentTaken(rentals: Map<string, RentalRecord>, record: RentalRecord): boolean {
  if (record.payTx === null) return false;
  return [...rentals.values()].some((other) => other.id !== record.id && other.payTx === record.payTx);
}

export function memoryRentals(box: StateBox): RentalStore {
  return {
    async create(record) {
      if (box.state.rentals.has(record.id)) return false;
      if (paymentTaken(box.state.rentals, record)) throw new Error('this payment already paid for another rental');
      box.state.rentals.set(record.id, copy(record));
      return true;
    },

    async get(id) {
      const record = box.state.rentals.get(id);
      return record ? copy(record) : null;
    },

    async save(record) {
      if (!box.state.rentals.has(record.id)) throw new Error(`there is no rental ${record.id}`);
      if (paymentTaken(box.state.rentals, record)) throw new Error('this payment already paid for another rental');
      box.state.rentals.set(record.id, copy(record));
    },

    async byOperator(operator, limit) {
      return [...box.state.rentals.values()]
        .filter((record) => record.operator === operator)
        .sort((a, b) => oldestFirst(b, a))
        .slice(0, limit)
        .map(copy);
    },

    async inStatus(statuses, limit) {
      return [...box.state.rentals.values()]
        .filter((record) => statuses.includes(record.status))
        .sort(oldestFirst)
        .slice(0, limit)
        .map(copy);
    },

    async byPayment(txHash) {
      const record = [...box.state.rentals.values()].find((other) => other.payTx === txHash);
      return record ? copy(record) : null;
    },

    async countActive() {
      return [...box.state.rentals.values()].filter((record) => record.parentId === null && ACTIVE.has(record.status))
        .length;
    },

    async countOpenQuotes(operator, now) {
      return [...box.state.rentals.values()].filter(
        (record) => record.operator === operator && record.status === 'quoted' && record.quoteExpiresAt > now,
      ).length;
    },

    async addRefund(refund) {
      if (box.state.refunds.has(refund.id)) return false;
      box.state.refunds.set(refund.id, copy(refund));
      return true;
    },

    async saveRefund(refund) {
      if (!box.state.refunds.has(refund.id)) throw new Error(`there is no refund ${refund.id}`);
      box.state.refunds.set(refund.id, copy(refund));
    },

    async refundsFor(rentalId) {
      return [...box.state.refunds.values()]
        .filter((refund) => refund.rentalId === rentalId)
        .sort(oldestFirst)
        .map(copy);
    },

    async openRefunds(limit) {
      return [...box.state.refunds.values()]
        .filter((refund) => refund.status !== 'done')
        .sort(oldestFirst)
        .slice(0, limit)
        .map(copy);
    },
  };
}
