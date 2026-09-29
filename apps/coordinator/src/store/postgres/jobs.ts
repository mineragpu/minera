import type { Address, Hex, JobKind } from '@dayagpu/shared';
import type { Queryable } from '../../db/client.ts';
import type { ChatMessage, JobParams, JobRecord, JobStatus, Verification } from '../records.ts';
import type { JobStore } from '../store.ts';
import { jsonb, toBigInt, toSafeNumber } from './convert.ts';

interface JobRow {
  id: string;
  group_id: string;
  kind: JobKind;
  model: string;
  messages: ChatMessage[];
  params: JobParams;
  expected: string | null;
  target_node: Address | null;
  status: JobStatus;
  assigned_node: Address | null;
  assigned_at: Date | null;
  deadline_at: Date | null;
  attempts: number;
  output: string | null;
  output_hash: Hex | null;
  units: number | null;
  verification: Verification;
  created_at: Date;
  expires_at: Date;
  finished_at: Date | null;
  verified_at: Date | null;
}

// Job ids are uuid columns; any other string can only be unknown, and Postgres would reject it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    kind: row.kind,
    model: row.model,
    messages: row.messages,
    params: row.params,
    expected: row.expected,
    targetNode: row.target_node,
    status: row.status,
    assignedNode: row.assigned_node,
    assignedAt: row.assigned_at,
    deadlineAt: row.deadline_at,
    attempts: row.attempts,
    output: row.output,
    outputHash: row.output_hash,
    units: row.units,
    verification: row.verification,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    finishedAt: row.finished_at,
    verifiedAt: row.verified_at,
  };
}

export function postgresJobs(db: Queryable): JobStore {
  return {
    async insert(job) {
      await db`
        INSERT INTO jobs (id, group_id, kind, model, messages, params, expected, target_node, created_at, expires_at)
        VALUES (
          ${job.id}, ${job.groupId}, ${job.kind}, ${job.model},
          ${jsonb(db, job.messages)}, ${jsonb(db, job.params)},
          ${job.expected}, ${job.targetNode}, ${job.createdAt}, ${job.expiresAt}
        )
      `;
    },

    async get(id) {
      if (!UUID.test(id)) return null;
      const [row] = await db<JobRow[]>`SELECT * FROM jobs WHERE id = ${id}`;
      return row ? toJob(row) : null;
    },

    async group(groupId) {
      if (!UUID.test(groupId)) return [];
      const rows = await db<JobRow[]>`SELECT * FROM jobs WHERE group_id = ${groupId} ORDER BY created_at, id`;
      return rows.map(toJob);
    },

    async assignable({ rig, qualified, now, limit }) {
      const rows = await db<JobRow[]>`
        SELECT j.* FROM jobs j
        WHERE j.status = 'queued'
          AND j.expires_at > ${now}
          AND j.model = ANY(${rig.models}::text[])
          AND (j.target_node = ${rig.nodeKey} OR (j.target_node IS NULL AND ${qualified}::boolean))
          AND NOT EXISTS (
            SELECT 1 FROM jobs twin JOIN rigs holder ON holder.node_key = twin.assigned_node
            WHERE twin.group_id = j.group_id AND twin.id <> j.id AND holder.operator = ${rig.operator}
          )
        ORDER BY (j.target_node IS NULL), j.created_at, j.id
        LIMIT ${limit}
        FOR UPDATE OF j SKIP LOCKED
      `;
      return rows.map(toJob);
    },

    async inFlight(nodeKey) {
      const [row] = await db<{ count: string }[]>`
        SELECT count(*) AS count FROM jobs WHERE assigned_node = ${nodeKey} AND status = 'assigned'
      `;
      return toSafeNumber(row?.count ?? 0);
    },

    async openChecks(nodeKey) {
      const rows = await db<JobRow[]>`
        SELECT * FROM jobs
        WHERE target_node = ${nodeKey} AND kind <> 'chat' AND status IN ('queued', 'assigned')
        ORDER BY created_at, id
      `;
      return rows.map(toJob);
    },

    async queuedCount(kind) {
      const [row] = await db<{ count: string }[]>`
        SELECT count(*) AS count FROM jobs WHERE kind = ${kind} AND status = 'queued'
      `;
      return toSafeNumber(row?.count ?? 0);
    },

    async assign(id, nodeKey, at, deadline) {
      await db`
        UPDATE jobs SET status = 'assigned', assigned_node = ${nodeKey}, assigned_at = ${at},
          deadline_at = ${deadline}, attempts = attempts + 1
        WHERE id = ${id}
      `;
    },

    async release(id) {
      await db`
        UPDATE jobs SET status = 'queued', assigned_node = NULL, assigned_at = NULL, deadline_at = NULL
        WHERE id = ${id}
      `;
    },

    async close(id, status, at) {
      await db`UPDATE jobs SET status = ${status}, finished_at = ${at} WHERE id = ${id}`;
    },

    async complete(id, result) {
      await db`
        UPDATE jobs SET status = 'done', output = ${result.output}, output_hash = ${result.outputHash},
          units = ${result.units}, verification = ${result.verification},
          finished_at = ${result.finishedAt}, verified_at = ${result.verifiedAt}
        WHERE id = ${id}
      `;
    },

    async setVerification(id, verification, at) {
      await db`UPDATE jobs SET verification = ${verification}, verified_at = ${at} WHERE id = ${id}`;
    },

    async overdue(now) {
      const rows = await db<JobRow[]>`
        SELECT * FROM jobs WHERE status = 'assigned' AND deadline_at < ${now} ORDER BY created_at, id
      `;
      return rows.map(toJob);
    },

    async stale(now) {
      const rows = await db<JobRow[]>`
        SELECT * FROM jobs WHERE status = 'queued' AND expires_at <= ${now} ORDER BY created_at, id
      `;
      return rows.map(toJob);
    },

    async completedSince(since) {
      const rows = await db<{ kind: JobKind; count: string }[]>`
        SELECT kind, count(*) AS count FROM jobs WHERE status = 'done' AND finished_at >= ${since} GROUP BY kind
      `;
      const counts: Record<JobKind, number> = { chat: 0, benchmark: 0, challenge: 0 };
      for (const row of rows) counts[row.kind] = toSafeNumber(row.count);
      return counts;
    },

    async verifiedUnitsSince(since) {
      const [row] = await db<{ units: string }[]>`
        SELECT COALESCE(sum(units), 0) AS units FROM jobs
        WHERE verification = 'verified' AND kind <> 'benchmark' AND verified_at >= ${since}
      `;
      return toBigInt(row?.units ?? 0);
    },

    async hourlyVerifiedUnits(nodeKey, since) {
      const rows = await db<{ hour: Date; units: string }[]>`
        SELECT to_timestamp(floor(extract(epoch FROM verified_at) / 3600) * 3600) AS hour, sum(units) AS units
        FROM jobs
        WHERE assigned_node = ${nodeKey} AND verification = 'verified' AND kind <> 'benchmark'
          AND verified_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `;
      return rows.map((row) => ({ hour: row.hour, units: toBigInt(row.units) }));
    },
  };
}
