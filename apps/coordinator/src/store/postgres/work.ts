import type { Address } from '@minera/shared';
import type { Queryable } from '../../db/client.ts';
import type { WorkStore } from '../store.ts';
import { toBigInt } from './convert.ts';

export function postgresWork(db: Queryable): WorkStore {
  return {
    async credit(nodeKey, epoch, units) {
      await db`
        INSERT INTO work (node_key, epoch, verified_units, unverified_units, paid_units)
        VALUES (${nodeKey}, ${epoch}, ${units.verified}, ${units.unverified}, ${units.paid})
        ON CONFLICT (node_key, epoch) DO UPDATE SET
          verified_units = work.verified_units + EXCLUDED.verified_units,
          unverified_units = work.unverified_units + EXCLUDED.unverified_units,
          paid_units = work.paid_units + EXCLUDED.paid_units
      `;
      if (units.verified > 0) {
        await db`UPDATE rigs SET verified_units = verified_units + ${units.verified} WHERE node_key = ${nodeKey}`;
      }
    },

    async epochUnits(nodeKey, epoch) {
      const [row] = await db<{ verified_units: string }[]>`
        SELECT verified_units FROM work WHERE node_key = ${nodeKey} AND epoch = ${epoch}
      `;
      return toBigInt(row?.verified_units ?? 0);
    },

    async verifiedByRig(fromEpoch, toEpoch) {
      const rows = await db<{ node_key: Address; operator: Address; verified: string; units: string }[]>`
        SELECT w.node_key, r.operator, sum(w.verified_units) AS verified,
          sum(CASE WHEN q.node_key IS NULL THEN w.paid_units ELSE 0 END) AS units
        FROM work w
        JOIN rigs r ON r.node_key = w.node_key
        LEFT JOIN quarantines q ON q.node_key = w.node_key AND q.epoch = w.epoch
        WHERE w.epoch BETWEEN ${fromEpoch} AND ${toEpoch}
        GROUP BY w.node_key, r.operator
        HAVING sum(CASE WHEN q.node_key IS NULL THEN w.paid_units ELSE 0 END) > 0
        ORDER BY w.node_key
      `;
      return rows.map((row) => ({
        nodeKey: row.node_key,
        operator: row.operator,
        verified: toBigInt(row.verified),
        units: toBigInt(row.units),
      }));
    },
  };
}
