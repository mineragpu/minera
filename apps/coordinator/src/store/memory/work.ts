import type { Address } from '@minera/shared';
import type { RigWork } from '../records.ts';
import type { WorkStore } from '../store.ts';
import type { StateBox } from './state.ts';

export function memoryWork(box: StateBox): WorkStore {
  return {
    async credit(nodeKey, epoch, units) {
      const key = `${nodeKey}:${epoch}`;
      const row = box.state.work.get(key) ?? { nodeKey, epoch, verified: 0n, unverified: 0n, paid: 0n };
      row.verified += BigInt(units.verified);
      row.unverified += BigInt(units.unverified);
      row.paid += BigInt(units.paid);
      box.state.work.set(key, row);
      const rig = box.state.rigs.get(nodeKey);
      if (rig) rig.verifiedUnits += BigInt(units.verified);
    },

    async epochUnits(nodeKey, epoch) {
      return box.state.work.get(`${nodeKey}:${epoch}`)?.verified ?? 0n;
    },

    async verifiedByRig(fromEpoch, toEpoch) {
      const totals = new Map<Address, { verified: bigint; units: bigint }>();
      for (const row of box.state.work.values()) {
        if (row.epoch < fromEpoch || row.epoch > toEpoch) continue;
        const paid = box.state.quarantines.has(`${row.nodeKey}:${row.epoch}`) ? 0n : row.paid;
        const total = totals.get(row.nodeKey) ?? { verified: 0n, units: 0n };
        totals.set(row.nodeKey, { verified: total.verified + row.verified, units: total.units + paid });
      }
      const work: RigWork[] = [];
      for (const [nodeKey, total] of totals) {
        const rig = box.state.rigs.get(nodeKey);
        if (rig && total.units > 0n) work.push({ nodeKey, operator: rig.operator, ...total });
      }
      return work.sort((a, b) => (a.nodeKey < b.nodeKey ? -1 : 1));
    },
  };
}
