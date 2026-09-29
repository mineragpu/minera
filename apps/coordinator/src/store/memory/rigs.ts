import type { Address } from '@dayagpu/shared';
import type { RigListEntry, RigRecord } from '../records.ts';
import type { RigStore } from '../store.ts';
import { copy, descending, type StateBox } from './state.ts';

export function memoryRigs(box: StateBox): RigStore {
  const find = (nodeKey: Address): RigRecord | undefined => box.state.rigs.get(nodeKey);
  const epochUnits = (nodeKey: Address, epoch: number): bigint =>
    box.state.work.get(`${nodeKey}:${epoch}`)?.verified ?? 0n;

  return {
    async get(nodeKey) {
      const rig = find(nodeKey);
      return rig ? copy(rig) : null;
    },

    async deploy(rig) {
      if (box.state.rigs.has(rig.nodeKey)) return;
      box.state.rigs.set(rig.nodeKey, {
        ...rig,
        retired: false,
        retiredAt: null,
        gpu: null,
        runtime: null,
        runtimeVersion: null,
        models: [],
        clientVersion: null,
        helloAt: null,
        lastSeenAt: null,
        qualifiedAt: null,
        lastChallengeAt: null,
        checksPassed: 0,
        checksFailed: 0,
        verifiedUnits: 0n,
      });
    },

    async setPair(nodeKey, pair) {
      const rig = find(nodeKey);
      if (rig) rig.pair = pair;
    },

    async retire(nodeKey, at) {
      const rig = find(nodeKey);
      if (rig && !rig.retired) {
        rig.retired = true;
        rig.retiredAt = at;
      }
    },

    async recordHello(nodeKey, report, now) {
      const rig = find(nodeKey);
      if (!rig) return;
      rig.gpu = copy(report.gpu);
      rig.runtime = report.runtime.runtime;
      rig.runtimeVersion = report.runtime.version ?? null;
      rig.models = [...report.runtime.models];
      rig.clientVersion = report.clientVersion;
      rig.helloAt = now;
      rig.lastSeenAt = now;
    },

    async recordHeartbeat(nodeKey, runtime, now) {
      const rig = find(nodeKey);
      if (!rig) return;
      rig.runtime = runtime.runtime;
      rig.runtimeVersion = runtime.version ?? null;
      rig.models = [...runtime.models];
      rig.lastSeenAt = now;
    },

    async recordCheck(nodeKey, passed, now) {
      const rig = find(nodeKey);
      if (!rig) return;
      if (passed) {
        rig.checksPassed += 1;
        rig.qualifiedAt = now;
      } else {
        rig.checksFailed += 1;
        rig.qualifiedAt = null;
      }
    },

    async markChallenged(nodeKey, now) {
      const rig = find(nodeKey);
      if (rig) rig.lastChallengeAt = now;
    },

    async list(query) {
      const rows: RigListEntry[] = [...box.state.rigs.values()]
        .filter(
          (rig) =>
            !rig.retired &&
            (query.pair === null || rig.pair === query.pair) &&
            (query.operator === null || rig.operator === query.operator),
        )
        .map((rig) => ({ ...copy(rig), epochUnits: epochUnits(rig.nodeKey, query.epoch) }));
      const newest = (a: RigListEntry, b: RigListEntry): number =>
        b.deployedAt.getTime() - a.deployedAt.getTime() || (a.nodeKey < b.nodeKey ? -1 : 1);
      const order: Record<typeof query.sort, (a: RigListEntry, b: RigListEntry) => number> = {
        new: newest,
        top: (a, b) => descending(a.verifiedUnits, b.verifiedUnits) || newest(a, b),
        epoch: (a, b) =>
          descending(a.epochUnits, b.epochUnits) || descending(a.verifiedUnits, b.verifiedUnits) || newest(a, b),
      };
      rows.sort(order[query.sort]);
      return { total: rows.length, rigs: rows.slice(query.offset, query.offset + query.limit) };
    },

    async counts(onlineSince) {
      const rigs = [...box.state.rigs.values()].filter((rig) => !rig.retired);
      const online = rigs.filter((rig) => rig.lastSeenAt !== null && rig.lastSeenAt >= onlineSince).length;
      return { total: rigs.length, online };
    },
  };
}
