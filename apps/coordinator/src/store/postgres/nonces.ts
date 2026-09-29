import type { Queryable } from '../../db/client.ts';
import type { NonceStore } from '../store.ts';

export function postgresNonces(db: Queryable): NonceStore {
  return {
    async use(nodeKey, nonce, expiresAt) {
      const inserted = await db`
        INSERT INTO nonces (node_key, nonce, expires_at) VALUES (${nodeKey}, ${nonce}, ${expiresAt})
        ON CONFLICT DO NOTHING
        RETURNING 1
      `;
      return inserted.length === 1;
    },

    async prune(now) {
      const removed = await db`DELETE FROM nonces WHERE expires_at < ${now}`;
      return removed.count;
    },
  };
}
