import type { Address, Hex } from '@dayagpu/shared';
import type { Queryable } from '../../db/client.ts';
import type { Entitlement, SettlementRecord, SettlementStatus, TreeDump } from '../records.ts';
import type { SettlementStore } from '../store.ts';
import { jsonb, toBigInt, toOptionalNumber, toSafeNumber } from './convert.ts';

interface SettlementRow {
  id: string;
  settlement_index: string | null;
  status: SettlementStatus;
  vetoed: boolean;
  root: Hex;
  total: string;
  inputs_digest: Hex | null;
  inputs: string | null;
  dump: TreeDump | null;
  previous_index: string | null;
  from_epoch: string | null;
  to_epoch: string | null;
  tx_hash: Hex | null;
  block_number: string | null;
  published_at: Date | null;
  claimable_at: Date | null;
  error: string | null;
  created_at: Date;
}

interface EntitlementRow {
  account: Address;
  cumulative: string;
  proof: Hex[];
}

function toSettlement(row: SettlementRow): SettlementRecord {
  return {
    id: toSafeNumber(row.id),
    index: toOptionalNumber(row.settlement_index),
    status: row.status,
    vetoed: row.vetoed,
    root: row.root,
    total: toBigInt(row.total),
    inputsDigest: row.inputs_digest,
    inputs: row.inputs,
    dump: row.dump,
    previousIndex: toOptionalNumber(row.previous_index),
    fromEpoch: toOptionalNumber(row.from_epoch),
    toEpoch: toOptionalNumber(row.to_epoch),
    txHash: row.tx_hash,
    blockNumber: row.block_number === null ? null : toBigInt(row.block_number),
    publishedAt: row.published_at,
    claimableAt: row.claimable_at,
    error: row.error,
    createdAt: row.created_at,
  };
}

function toEntitlement(row: EntitlementRow): Entitlement {
  return { account: row.account, cumulative: toBigInt(row.cumulative), proof: row.proof };
}

export function postgresSettlements(db: Queryable): SettlementStore {
  return {
    async createDraft(draft) {
      const entitlements = draft.entitlements.map((entry) => ({
        account: entry.account,
        cumulative: entry.cumulative.toString(),
        proof: entry.proof,
      }));
      // One statement, so the settlement never exists without its entitlements.
      const [row] = await db<{ id: string }[]>`
        WITH settlement AS (
          INSERT INTO settlements (
            status, root, total, inputs_digest, inputs, dump, previous_index, from_epoch, to_epoch, created_at
          ) VALUES (
            'sending', ${draft.root}, ${draft.total.toString()}, ${draft.inputsDigest}, ${draft.inputs},
            ${jsonb(db, draft.dump)}, ${draft.previousIndex}, ${draft.fromEpoch}, ${draft.toEpoch},
            ${draft.createdAt}
          )
          RETURNING id
        ), stored AS (
          INSERT INTO entitlements (settlement_id, account, cumulative, proof)
          SELECT settlement.id, entry.account, entry.cumulative, entry.proof
          FROM settlement, jsonb_to_recordset(${jsonb(db, entitlements)})
            AS entry(account text, cumulative numeric, proof jsonb)
          RETURNING 1
        )
        SELECT id FROM settlement
      `;
      if (!row) throw new Error('the settlement draft was not stored');
      return toSafeNumber(row.id);
    },

    async markSent(id, txHash) {
      await db`UPDATE settlements SET status = 'sent', tx_hash = ${txHash} WHERE id = ${id}`;
    },

    async markFailed(id, error) {
      await db`UPDATE settlements SET status = 'failed', error = ${error} WHERE id = ${id}`;
    },

    async recordPublished(published) {
      const fields = db`
        settlement_index = ${published.index}, status = 'published', root = ${published.root},
        total = ${published.total.toString()}, inputs_digest = ${published.inputsDigest},
        tx_hash = ${published.txHash}, block_number = ${published.blockNumber.toString()},
        published_at = ${published.publishedAt}, claimable_at = ${published.claimableAt}, error = NULL
      `;
      const byIndex = await db`
        UPDATE settlements SET ${fields} WHERE settlement_index = ${published.index} RETURNING id
      `;
      if (byIndex.length > 0) return;
      const byRoot = await db`
        UPDATE settlements SET ${fields}
        WHERE id = (
          SELECT id FROM settlements
          WHERE settlement_index IS NULL AND root = ${published.root} AND inputs_digest = ${published.inputsDigest}
          ORDER BY id DESC
          LIMIT 1
        )
        RETURNING id
      `;
      if (byRoot.length > 0) return;
      await db`
        INSERT INTO settlements (
          settlement_index, status, root, total, inputs_digest, tx_hash, block_number,
          published_at, claimable_at, created_at
        ) VALUES (
          ${published.index}, 'published', ${published.root}, ${published.total.toString()},
          ${published.inputsDigest}, ${published.txHash}, ${published.blockNumber.toString()},
          ${published.publishedAt}, ${published.claimableAt}, ${published.publishedAt}
        )
        ON CONFLICT DO NOTHING
      `;
    },

    async markVetoed(index) {
      await db`UPDATE settlements SET vetoed = true WHERE settlement_index = ${index}`;
    },

    async open() {
      const rows = await db<SettlementRow[]>`
        SELECT * FROM settlements WHERE status IN ('sending', 'sent') ORDER BY id
      `;
      return rows.map(toSettlement);
    },

    async byIndex(index) {
      const [row] = await db<SettlementRow[]>`SELECT * FROM settlements WHERE settlement_index = ${index}`;
      return row ? toSettlement(row) : null;
    },

    async recent(limit) {
      const rows = await db<SettlementRow[]>`
        SELECT * FROM settlements WHERE settlement_index IS NOT NULL
        ORDER BY settlement_index DESC
        LIMIT ${limit}
      `;
      return rows.map(toSettlement);
    },

    async entitlements(settlementId) {
      const rows = await db<EntitlementRow[]>`
        SELECT account, cumulative, proof FROM entitlements WHERE settlement_id = ${settlementId} ORDER BY account
      `;
      return rows.map(toEntitlement);
    },

    async entitlement(settlementId, account) {
      const [row] = await db<EntitlementRow[]>`
        SELECT account, cumulative, proof FROM entitlements
        WHERE settlement_id = ${settlementId} AND account = ${account}
      `;
      return row ? toEntitlement(row) : null;
    },

    async latestClaimable(now) {
      const [row] = await db<SettlementRow[]>`
        SELECT * FROM settlements
        WHERE status = 'published' AND NOT vetoed AND settlement_index IS NOT NULL AND claimable_at <= ${now}
        ORDER BY settlement_index DESC
        LIMIT 1
      `;
      return row ? toSettlement(row) : null;
    },

    async latestPending(now) {
      const [row] = await db<SettlementRow[]>`
        SELECT * FROM settlements
        WHERE status = 'published' AND NOT vetoed AND settlement_index IS NOT NULL AND claimable_at > ${now}
        ORDER BY settlement_index DESC
        LIMIT 1
      `;
      return row ? toSettlement(row) : null;
    },
  };
}
