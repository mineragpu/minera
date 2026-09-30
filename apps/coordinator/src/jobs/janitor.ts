import { epochOf } from '../epoch.ts';
import { missCanary } from '../sentinel/canary.ts';
import { strike } from '../sentinel/standing.ts';
import type { JobRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { JOB_POLICY } from './policy.ts';

export interface SweepResult {
  requeued: number;
  expired: number;
}

/** A dropped job can leave answers waiting on it; those answers are now simply unverified. */
async function releaseTwins(tx: Store, dropped: JobRecord, now: Date, epochSeconds: number): Promise<void> {
  for (const twin of await tx.jobs.group(dropped.groupId)) {
    if (twin.id === dropped.id || twin.status !== 'done' || twin.verification !== 'pending') continue;
    await tx.jobs.setVerification(twin.id, 'unverified', null);
    if (twin.assignedNode && twin.origin === 'playground') {
      const units = twin.units ?? 0;
      await tx.work.credit(twin.assignedNode, epochOf(now, epochSeconds), { verified: 0, unverified: units, paid: 0 });
    }
  }
}

/**
 * Whether the rig holding an overdue job kept calling in after its deadline. A rig that went
 * offline only drops the job; one that stayed online and sat on it held work it did not do.
 */
async function heldWhileOnline(tx: Store, job: JobRecord): Promise<boolean> {
  if (job.assignedNode === null || job.deadlineAt === null) return false;
  const rig = await tx.rigs.get(job.assignedNode);
  return rig !== null && rig.lastSeenAt !== null && rig.lastSeenAt >= job.deadlineAt;
}

/**
 * Put overdue open jobs back on the queue for another rig, drop checks and jobs that ran out of
 * attempts or time, and settle any answer left waiting on a dropped job. A rig that stays online
 * and lets a canary or a job run out takes a strike.
 */
export async function sweepJobs(store: Store, now: Date, epochSeconds: number): Promise<SweepResult> {
  return store.transaction(async (tx) => {
    let requeued = 0;
    let expired = 0;
    for (const job of await tx.jobs.overdue(now)) {
      const held = await heldWhileOnline(tx, job);
      if (job.origin === 'canary') {
        await tx.jobs.close(job.id, 'expired', now);
        if (held) await missCanary(tx, job, now, epochSeconds);
        expired += 1;
        continue;
      }
      if (held && job.kind === 'chat' && job.assignedNode) {
        await strike(tx, job.assignedNode, 'job_abandoned', now, epochSeconds);
      }
      if (job.kind === 'chat' && job.attempts < JOB_POLICY.maxAttempts && job.expiresAt > now) {
        await tx.jobs.release(job.id);
        requeued += 1;
      } else {
        await tx.jobs.close(job.id, 'expired', now);
        await releaseTwins(tx, job, now, epochSeconds);
        expired += 1;
      }
    }
    for (const job of await tx.jobs.stale(now)) {
      await tx.jobs.close(job.id, 'expired', now);
      await releaseTwins(tx, job, now, epochSeconds);
      expired += 1;
    }
    return { requeued, expired };
  });
}
