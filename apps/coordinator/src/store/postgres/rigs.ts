import type { Address, GpuInfo } from '@dayagpu/shared';
import type { Fragment, Queryable } from '../../db/client.ts';
import type { RigListEntry, RigRecord, RigSort } from '../records.ts';
import type { RigStore } from '../store.ts';
import { jsonb, toBigInt, toSafeNumber } from './convert.ts';

interface RigRow {
  node_key: Address;
  operator: Address;
  pair: Address;
  name: string;
  deployed_at: Date;
  deployed_block: string;
  retired_at: Date | null;
  gpu: GpuInfo | null;
  runtime: string | null;
  runtime_version: string | null;
  models: string[];
  client_version: string | null;
  hello_at: Date | null;
  last_seen_at: Date | null;
  qualified_at: Date | null;
  last_challenge_at: Date | null;
  checks_passed: number;
  checks_failed: number;
  verified_units: string;
}

function toRig(row: RigRow): RigRecord {
  return {
    nodeKey: row.node_key,
    operator: row.operator,
    pair: row.pair,
    name: row.name,
    deployedAt: row.deployed_at,
    deployedBlock: toBigInt(row.deployed_block),
    retired: row.retired_at !== null,
    retiredAt: row.retired_at,
    gpu: row.gpu,
    runtime: row.runtime,
    runtimeVersion: row.runtime_version,
    models: row.models,
    clientVersion: row.client_version,
    helloAt: row.hello_at,
    lastSeenAt: row.last_seen_at,
    qualifiedAt: row.qualified_at,
    lastChallengeAt: row.last_challenge_at,
    checksPassed: row.checks_passed,
    checksFailed: row.checks_failed,
    verifiedUnits: toBigInt(row.verified_units),
  };
}

function orderBy(db: Queryable, sort: RigSort): Fragment {
  switch (sort) {
    case 'new':
      return db`r.deployed_at DESC, r.node_key`;
    case 'top':
      return db`r.verified_units DESC, r.deployed_at DESC, r.node_key`;
    case 'epoch':
      return db`epoch_units DESC, r.verified_units DESC, r.deployed_at DESC, r.node_key`;
  }
}

export function postgresRigs(db: Queryable): RigStore {
  return {
    async get(nodeKey) {
      const [row] = await db<RigRow[]>`SELECT * FROM rigs WHERE node_key = ${nodeKey}`;
      return row ? toRig(row) : null;
    },

    async deploy(rig) {
      await db`
        INSERT INTO rigs (node_key, operator, pair, name, deployed_at, deployed_block)
        VALUES (
          ${rig.nodeKey}, ${rig.operator}, ${rig.pair}, ${rig.name}, ${rig.deployedAt}, ${rig.deployedBlock.toString()}
        )
        ON CONFLICT (node_key) DO NOTHING
      `;
    },

    async setPair(nodeKey, pair) {
      await db`UPDATE rigs SET pair = ${pair} WHERE node_key = ${nodeKey}`;
    },

    async retire(nodeKey, at) {
      await db`UPDATE rigs SET retired_at = ${at} WHERE node_key = ${nodeKey} AND retired_at IS NULL`;
    },

    async recordHello(nodeKey, report, now) {
      await db`
        UPDATE rigs SET
          gpu = ${report.gpu === null ? null : jsonb(db, report.gpu)},
          runtime = ${report.runtime.runtime},
          runtime_version = ${report.runtime.version ?? null},
          models = ${report.runtime.models}::text[],
          client_version = ${report.clientVersion},
          hello_at = ${now},
          last_seen_at = ${now}
        WHERE node_key = ${nodeKey}
      `;
    },

    async recordHeartbeat(nodeKey, runtime, now) {
      await db`
        UPDATE rigs SET
          runtime = ${runtime.runtime},
          runtime_version = ${runtime.version ?? null},
          models = ${runtime.models}::text[],
          last_seen_at = ${now}
        WHERE node_key = ${nodeKey}
      `;
    },

    async recordCheck(nodeKey, passed, now) {
      if (passed) {
        await db`UPDATE rigs SET checks_passed = checks_passed + 1, qualified_at = ${now} WHERE node_key = ${nodeKey}`;
      } else {
        await db`UPDATE rigs SET checks_failed = checks_failed + 1 WHERE node_key = ${nodeKey}`;
      }
    },

    async markChallenged(nodeKey, now) {
      await db`UPDATE rigs SET last_challenge_at = ${now} WHERE node_key = ${nodeKey}`;
    },

    async list(query) {
      const rows = await db<(RigRow & { epoch_units: string })[]>`
        SELECT r.*, COALESCE(w.verified_units, 0) AS epoch_units
        FROM rigs r
        LEFT JOIN work w ON w.node_key = r.node_key AND w.epoch = ${query.epoch}
        WHERE r.retired_at IS NULL AND (${query.pair}::text IS NULL OR r.pair = ${query.pair})
        ORDER BY ${orderBy(db, query.sort)}
        LIMIT ${query.limit} OFFSET ${query.offset}
      `;
      const [count] = await db<{ total: string }[]>`
        SELECT count(*) AS total FROM rigs
        WHERE retired_at IS NULL AND (${query.pair}::text IS NULL OR pair = ${query.pair})
      `;
      return {
        total: toSafeNumber(count?.total ?? 0),
        rigs: rows.map((row): RigListEntry => ({ ...toRig(row), epochUnits: toBigInt(row.epoch_units) })),
      };
    },

    async counts(onlineSince) {
      const [row] = await db<{ total: string; online: string }[]>`
        SELECT count(*) AS total, count(*) FILTER (WHERE last_seen_at >= ${onlineSince}) AS online
        FROM rigs WHERE retired_at IS NULL
      `;
      return { total: toSafeNumber(row?.total ?? 0), online: toSafeNumber(row?.online ?? 0) };
    },
  };
}
