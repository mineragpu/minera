import type { Address, Hex } from '@minera/shared';
import type { Queryable } from '../../db/client.ts';
import type { BurnRecord } from '../records.ts';
import type { ChainStore } from '../store.ts';
import { toBigInt, toSafeNumber } from './convert.ts';

const CURSOR = 'events';

interface BurnRow {
  tx_hash: Hex;
  log_index: number;
  block_number: string;
  block_time: Date;
  sender: Address;
  amount: string;
  campaign_id: string;
  memo: Hex;
}

function toBurn(row: BurnRow): BurnRecord {
  return {
    txHash: row.tx_hash,
    logIndex: row.log_index,
    blockNumber: toBigInt(row.block_number),
    blockTime: row.block_time,
    from: row.sender,
    amount: toBigInt(row.amount),
    campaignId: toBigInt(row.campaign_id),
    memo: row.memo,
  };
}

export function postgresChain(db: Queryable): ChainStore {
  return {
    async cursor() {
      const [row] = await db<{ block: string }[]>`SELECT block FROM chain_cursor WHERE name = ${CURSOR}`;
      return row ? toBigInt(row.block) : null;
    },

    async setCursor(block) {
      await db`
        INSERT INTO chain_cursor (name, block) VALUES (${CURSOR}, ${block.toString()})
        ON CONFLICT (name) DO UPDATE SET block = EXCLUDED.block
      `;
    },

    async addBurn(burn) {
      await db`
        INSERT INTO burns (tx_hash, log_index, block_number, block_time, sender, amount, campaign_id, memo)
        VALUES (
          ${burn.txHash}, ${burn.logIndex}, ${burn.blockNumber.toString()}, ${burn.blockTime}, ${burn.from},
          ${burn.amount.toString()}, ${burn.campaignId.toString()}, ${burn.memo}
        )
        ON CONFLICT DO NOTHING
      `;
    },

    async addClaim(claim) {
      await db`
        INSERT INTO claims (tx_hash, log_index, block_number, block_time, account, settlement_index, amount, via)
        VALUES (
          ${claim.txHash}, ${claim.logIndex}, ${claim.blockNumber.toString()}, ${claim.blockTime}, ${claim.account},
          ${claim.index}, ${claim.amount.toString()}, ${claim.via}
        )
        ON CONFLICT DO NOTHING
      `;
    },

    async recentBurns(limit) {
      const rows = await db<BurnRow[]>`
        SELECT * FROM burns ORDER BY block_number DESC, log_index DESC LIMIT ${limit}
      `;
      return rows.map(toBurn);
    },

    async currentCampaign() {
      const [row] = await db<
        { campaign_id: string; memo: Hex; burned: string; burns: string; first_burn_at: Date; last_burn_at: Date }[]
      >`
        WITH newest AS (
          SELECT campaign_id, memo FROM burns WHERE campaign_id > 0
          ORDER BY block_number DESC, log_index DESC
          LIMIT 1
        )
        SELECT newest.campaign_id, newest.memo, sum(burns.amount) AS burned, count(*) AS burns,
          min(burns.block_time) AS first_burn_at, max(burns.block_time) AS last_burn_at
        FROM newest JOIN burns ON burns.campaign_id = newest.campaign_id
        GROUP BY newest.campaign_id, newest.memo
      `;
      if (!row) return null;
      return {
        campaignId: toBigInt(row.campaign_id),
        memo: row.memo,
        burned: toBigInt(row.burned),
        burns: toSafeNumber(row.burns),
        firstBurnAt: row.first_burn_at,
        lastBurnAt: row.last_burn_at,
      };
    },

    async claimedBy(account) {
      const [row] = await db<{ amount: string }[]>`
        SELECT COALESCE(sum(amount), 0) AS amount FROM claims WHERE account = ${account}
      `;
      return toBigInt(row?.amount ?? 0);
    },
  };
}
