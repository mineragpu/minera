import type { PairingStore } from '../store.ts';
import { copy, type StateBox } from './state.ts';

export function memoryPairings(box: StateBox): PairingStore {
  return {
    async put(record) {
      const held = box.state.pairings.get(record.code);
      if (held && held.nodeKey !== record.nodeKey) return false;
      box.state.pairings.set(record.code, copy(record));
      return true;
    },

    async get(code, now) {
      const record = box.state.pairings.get(code);
      return record && record.expiresAt > now ? copy(record) : null;
    },

    async prune(now) {
      let removed = 0;
      for (const [code, record] of box.state.pairings) {
        if (record.expiresAt <= now) {
          box.state.pairings.delete(code);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
