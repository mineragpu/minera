import { SENTINEL_GATES, type Address, type SentinelGate } from '@minera/shared';
import type { Queryable } from '../../db/client.ts';
import type { CanaryRecord, ChatMessage, JobParams } from '../records.ts';
import type { SentinelStore, TallyOutcome } from '../store.ts';
import { jsonb, toSafeNumber } from './convert.ts';

interface CanaryRow {
  id: string;
  model: string;
  messages: ChatMessage[];
  params: JobParams;
  answer: string;
  sources: Address[];
  served_to: Address[];
  confirmations: number;
  disputes: number;
  created_at: Date;
}

const MINUTE_MS = 60_000;

function minuteOf(at: Date): Date {
  return new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS);
}

function toCanary(row: CanaryRow): CanaryRecord {
  return {
    id: row.id,
    model: row.model,
    messages: row.messages,
    params: row.params,
    answer: row.answer,
    sources: row.sources,
    servedTo: row.served_to,
    confirmations: row.confirmations,
    disputes: row.disputes,
    createdAt: row.created_at,
  };
}

export function postgresSentinel(db: Queryable): SentinelStore {
  return {
    async tally(gate, outcome, at) {
      await db`
        INSERT INTO sentinel_tally (minute, gate, outcome, count) VALUES (${minuteOf(at)}, ${gate}, ${outcome}, 1)
        ON CONFLICT (minute, gate, outcome) DO UPDATE SET count = sentinel_tally.count + 1
      `;
    },

    async gateCounts(since) {
      const rows = await db<{ gate: SentinelGate; outcome: TallyOutcome; count: string }[]>`
        SELECT gate, outcome, sum(count) AS count FROM sentinel_tally
        WHERE minute >= ${minuteOf(since)}
        GROUP BY gate, outcome
      `;
      return SENTINEL_GATES.map((gate) => {
        const count = (outcome: TallyOutcome): number =>
          toSafeNumber(rows.find((row) => row.gate === gate && row.outcome === outcome)?.count ?? 0);
        return { gate, passed: count('passed'), blocked: count('blocked') };
      });
    },

    async strike(nodeKey, reason, at) {
      await db`INSERT INTO strikes (node_key, reason, at) VALUES (${nodeKey}, ${reason}, ${at})`;
    },

    async strikesSince(nodeKey, since) {
      const [row] = await db<{ count: string }[]>`
        SELECT count(*) AS count FROM strikes WHERE node_key = ${nodeKey} AND at >= ${since}
      `;
      return toSafeNumber(row?.count ?? 0);
    },

    async quarantine(nodeKey, epochs) {
      if (epochs.length === 0) return;
      await db`
        INSERT INTO quarantines (node_key, epoch)
        SELECT ${nodeKey}, epoch FROM unnest(${[...epochs]}::bigint[]) AS epoch
        ON CONFLICT (node_key, epoch) DO NOTHING
      `;
    },

    async addCanary(canary) {
      await db`
        INSERT INTO canaries (id, model, messages, params, answer, sources, created_at)
        VALUES (
          ${canary.id}, ${canary.model}, ${jsonb(db, canary.messages)}, ${jsonb(db, canary.params)},
          ${canary.answer}, ${canary.sources}::text[], ${canary.createdAt}
        )
      `;
    },

    async getCanary(id) {
      const [row] = await db<CanaryRow[]>`SELECT * FROM canaries WHERE id = ${id}`;
      return row ? toCanary(row) : null;
    },

    async pickCanary(model, nodeKey, random) {
      const [counted] = await db<{ count: string }[]>`
        SELECT count(*) AS count FROM canaries
        WHERE model = ${model} AND NOT (${nodeKey} = ANY (sources)) AND NOT (${nodeKey} = ANY (served_to))
      `;
      const eligible = toSafeNumber(counted?.count ?? 0);
      if (eligible === 0) return null;
      const [row] = await db<CanaryRow[]>`
        SELECT * FROM canaries
        WHERE model = ${model} AND NOT (${nodeKey} = ANY (sources)) AND NOT (${nodeKey} = ANY (served_to))
        ORDER BY created_at, id
        OFFSET ${random.int(eligible)} LIMIT 1
      `;
      return row ? toCanary(row) : null;
    },

    async markServed(id, nodeKey) {
      await db`
        UPDATE canaries SET served_to = array_append(served_to, ${nodeKey}::text)
        WHERE id = ${id} AND NOT (${nodeKey} = ANY (served_to))
      `;
    },

    async confirm(id) {
      await db`UPDATE canaries SET confirmations = confirmations + 1 WHERE id = ${id}`;
    },

    async dispute(id) {
      await db`UPDATE canaries SET disputes = disputes + 1 WHERE id = ${id}`;
    },

    async retire(id) {
      await db`DELETE FROM canaries WHERE id = ${id}`;
    },

    async canaryCount(model) {
      const [row] = await db<{ count: string }[]>`SELECT count(*) AS count FROM canaries WHERE model = ${model}`;
      return toSafeNumber(row?.count ?? 0);
    },

    async prune(before, bankSize) {
      await db`DELETE FROM sentinel_tally WHERE minute < ${minuteOf(before)}`;
      await db`DELETE FROM strikes WHERE at < ${before}`;
      await db`
        DELETE FROM canaries c USING (
          SELECT id, row_number() OVER (PARTITION BY model ORDER BY created_at DESC, id DESC) AS rank FROM canaries
        ) ranked
        WHERE c.id = ranked.id AND ranked.rank > ${bankSize}
      `;
    },
  };
}
