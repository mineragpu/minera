import type { Address, Hex } from '@minera/shared';
import type { Queryable } from '../../db/client.ts';
import type { PairingRecord } from '../records.ts';
import type { PairingStore } from '../store.ts';

interface PairingRow {
  code: string;
  node_key: string;
  operator: string;
  deploy_code: string;
  gpu_model: string | null;
  gpu_vram_mb: number | null;
  client_version: string;
  paired_at: Date;
  expires_at: Date;
}

function toRecord(row: PairingRow): PairingRecord {
  return {
    code: row.code,
    nodeKey: row.node_key as Address,
    operator: row.operator as Address,
    deployCode: row.deploy_code as Hex,
    gpu: row.gpu_model === null || row.gpu_vram_mb === null ? null : { model: row.gpu_model, vramMb: row.gpu_vram_mb },
    clientVersion: row.client_version,
    pairedAt: row.paired_at,
    expiresAt: row.expires_at,
  };
}

export function postgresPairings(db: Queryable): PairingStore {
  return {
    async put(record) {
      const saved = await db`
        INSERT INTO pairings
          (code, node_key, operator, deploy_code, gpu_model, gpu_vram_mb, client_version, paired_at, expires_at)
        VALUES (
          ${record.code}, ${record.nodeKey}, ${record.operator}, ${record.deployCode},
          ${record.gpu?.model ?? null}, ${record.gpu?.vramMb ?? null}, ${record.clientVersion},
          ${record.pairedAt}, ${record.expiresAt}
        )
        ON CONFLICT (code) DO UPDATE SET
          operator = EXCLUDED.operator,
          deploy_code = EXCLUDED.deploy_code,
          gpu_model = EXCLUDED.gpu_model,
          gpu_vram_mb = EXCLUDED.gpu_vram_mb,
          client_version = EXCLUDED.client_version,
          paired_at = EXCLUDED.paired_at,
          expires_at = EXCLUDED.expires_at
        WHERE pairings.node_key = EXCLUDED.node_key
        RETURNING 1
      `;
      return saved.length === 1;
    },

    async get(code, now) {
      const rows = await db<PairingRow[]>`
        SELECT code, node_key, operator, deploy_code, gpu_model, gpu_vram_mb, client_version, paired_at, expires_at
        FROM pairings
        WHERE code = ${code} AND expires_at > ${now}
      `;
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async prune(now) {
      const removed = await db`DELETE FROM pairings WHERE expires_at <= ${now}`;
      return removed.count;
    },
  };
}
