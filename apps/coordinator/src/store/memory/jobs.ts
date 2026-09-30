import type { Address, JobKind } from '@minera/shared';
import type { HourlyUnits, JobRecord } from '../records.ts';
import type { JobStore } from '../store.ts';
import { copy, type StateBox } from './state.ts';

const HOUR_MS = 3_600_000;

export function memoryJobs(box: StateBox): JobStore {
  const all = (): JobRecord[] => [...box.state.jobs.values()];
  const find = (id: string): JobRecord => {
    const job = box.state.jobs.get(id);
    if (!job) throw new Error(`unknown job ${id}`);
    return job;
  };
  const operatorOf = (nodeKey: Address): Address | undefined => box.state.rigs.get(nodeKey)?.operator;
  const byCreation = (a: JobRecord, b: JobRecord): number =>
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return {
    async insert(job) {
      if (box.state.jobs.has(job.id)) throw new Error(`job ${job.id} already exists`);
      box.state.jobs.set(job.id, {
        ...copy(job),
        status: 'queued',
        assignedNode: null,
        assignedAt: null,
        deadlineAt: null,
        attempts: 0,
        output: null,
        outputHash: null,
        units: null,
        verification: 'pending',
        finishedAt: null,
        verifiedAt: null,
      });
    },

    async get(id) {
      const job = box.state.jobs.get(id);
      return job ? copy(job) : null;
    },

    async group(groupId) {
      return all()
        .filter((job) => job.groupId === groupId)
        .sort(byCreation)
        .map(copy);
    },

    async assignable({ rig, qualified, now, limit }) {
      const heldBySameOperator = (job: JobRecord): boolean =>
        all().some(
          (twin) =>
            twin.groupId === job.groupId &&
            twin.id !== job.id &&
            twin.assignedNode !== null &&
            operatorOf(twin.assignedNode) === rig.operator,
        );
      return all()
        .filter(
          (job) =>
            job.status === 'queued' &&
            job.expiresAt > now &&
            rig.models.includes(job.model) &&
            (job.targetNode === rig.nodeKey || (job.targetNode === null && qualified)) &&
            !heldBySameOperator(job),
        )
        .sort((a, b) => Number(a.targetNode === null) - Number(b.targetNode === null) || byCreation(a, b))
        .slice(0, limit)
        .map(copy);
    },

    async inFlight(nodeKey) {
      return all().filter((job) => job.status === 'assigned' && job.assignedNode === nodeKey).length;
    },

    async openChecks(nodeKey) {
      return all()
        .filter(
          (job) =>
            job.targetNode === nodeKey &&
            job.kind !== 'chat' &&
            (job.status === 'queued' || job.status === 'assigned'),
        )
        .sort(byCreation)
        .map(copy);
    },

    async queuedCount(kind) {
      return all().filter((job) => job.kind === kind && job.status === 'queued').length;
    },

    async assign(id, nodeKey, at, deadline) {
      const job = find(id);
      job.status = 'assigned';
      job.assignedNode = nodeKey;
      job.assignedAt = at;
      job.deadlineAt = deadline;
      job.attempts += 1;
    },

    async release(id) {
      const job = find(id);
      job.status = 'queued';
      job.assignedNode = null;
      job.assignedAt = null;
      job.deadlineAt = null;
    },

    async close(id, status, at) {
      const job = find(id);
      job.status = status;
      job.finishedAt = at;
    },

    async expireBy(id, at) {
      const job = find(id);
      if (at < job.expiresAt) job.expiresAt = at;
    },

    async complete(id, result) {
      const job = find(id);
      job.status = 'done';
      job.output = result.output;
      job.outputHash = result.outputHash;
      job.units = result.units;
      job.verification = result.verification;
      job.finishedAt = result.finishedAt;
      job.verifiedAt = result.verifiedAt;
    },

    async setVerification(id, verification, at) {
      const job = find(id);
      job.verification = verification;
      job.verifiedAt = at;
    },

    async overdue(now) {
      return all()
        .filter((job) => job.status === 'assigned' && job.deadlineAt !== null && job.deadlineAt < now)
        .sort(byCreation)
        .map(copy);
    },

    async stale(now) {
      return all()
        .filter((job) => job.status === 'queued' && job.expiresAt <= now)
        .sort(byCreation)
        .map(copy);
    },

    async completedSince(since) {
      const counts: Record<JobKind, number> = { chat: 0, benchmark: 0, challenge: 0 };
      for (const job of all()) {
        if (job.status === 'done' && job.finishedAt !== null && job.finishedAt >= since) counts[job.kind] += 1;
      }
      return counts;
    },

    async verifiedUnitsSince(since) {
      let units = 0n;
      for (const job of all()) {
        if (isPaidVerified(job) && job.verifiedAt !== null && job.verifiedAt >= since) units += BigInt(job.units ?? 0);
      }
      return units;
    },

    async hourlyVerifiedUnits(nodeKey, since) {
      const buckets = new Map<number, bigint>();
      for (const job of all()) {
        if (job.assignedNode !== nodeKey || !isPaidVerified(job)) continue;
        if (job.verifiedAt === null || job.verifiedAt < since) continue;
        const hour = Math.floor(job.verifiedAt.getTime() / HOUR_MS) * HOUR_MS;
        buckets.set(hour, (buckets.get(hour) ?? 0n) + BigInt(job.units ?? 0));
      }
      return [...buckets]
        .sort(([a], [b]) => a - b)
        .map(([hour, units]): HourlyUnits => ({ hour: new Date(hour), units }));
    },
  };
}

function isPaidVerified(job: JobRecord): boolean {
  return job.verification === 'verified' && job.kind === 'chat';
}
