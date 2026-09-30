import type { Address } from '@minera/shared';
import type { RigWork } from '../records.ts';
import type { WorkStore } from '../store.ts';
import type { StateBox } from './state.ts';

export function memoryWork(box: StateBox): WorkStore {
  return {
    async credit(nodeKey, epoch, units) {
      const key = `${nodeKey}:${epoch}`;
      const row = box.state.work.get(key) ?? { nodeKey, epoch, verified: 0n, unverified: 0n };
      row.verified += BigInt(units.verified);
      row.unverified += BigInt(units.unverified);
      box.state.work.set(key, row);
      const rig = box.state.rigs.get(nodeKey);
      if (rig) rig.verifiedUnits += BigInt(units.verified);
    },

    async epochUnits(nodeKey, epoch) {
      return box.state.work.get(`${nodeKey}:${epoch}`)?.verified ?? 0n;
    },

    async verifiedByRig(fromEpoch, toEpoch) {
      const totals = new Map<Address, bigint>();
      for (const row of box.state.work.values()) {
        if (row.epoch < fromEpoch || row.epoch > toEpoch || row.verified === 0n) continue;
        totals.set(row.nodeKey, (totals.get(row.nodeKey) ?? 0n) + row.verified);
      }
      const work: RigWork[] = [];
      for (const [nodeKey, units] of totals) {
        const rig = box.state.rigs.get(nodeKey);
        if (rig) work.push({ nodeKey, operator: rig.operator, units });
      }
      return work.sort((a, b) => (a.nodeKey < b.nodeKey ? -1 : 1));
    },
  };
}
