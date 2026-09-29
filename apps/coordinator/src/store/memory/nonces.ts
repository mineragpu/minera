import type { NonceStore } from '../store.ts';
import type { StateBox } from './state.ts';

export function memoryNonces(box: StateBox): NonceStore {
  return {
    async use(nodeKey, nonce, expiresAt) {
      const key = `${nodeKey}:${nonce}`;
      if (box.state.nonces.has(key)) return false;
      box.state.nonces.set(key, expiresAt);
      return true;
    },

    async prune(now) {
      let removed = 0;
      for (const [key, expiresAt] of box.state.nonces) {
        if (expiresAt < now) {
          box.state.nonces.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
