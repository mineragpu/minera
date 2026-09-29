import { epochOf } from '../epoch.ts';
import type { JobRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { JOB_POLICY } from './policy.ts';

export interface SweepResult {
  requeued: number;
  expired: number;
}

/** A dropped job can leave its twin's result waiting; that result is now simply unverified. */
async function releaseTwins(tx: Store, dropped: JobRecord, now: Date, epochSeconds: number): Promise<void> {
  for (const twin of await tx.jobs.group(dropped.groupId)) {
    if (twin.id === dropped.id || twin.status !== 'done' || twin.verification !== 'pending') continue;
    await tx.jobs.setVerification(twin.id, 'unverified', null);
    if (twin.assignedNode) {
      await tx.work.credit(twin.assignedNode, epochOf(now, epochSeconds), { verified: 0, unverified: twin.units ?? 0 });
    }
  }
}

/**
 * Put overdue open jobs back on the queue for another rig, drop checks and jobs that ran out of
 * attempts or time, and settle any twin left waiting on a dropped job.
 */
export async function sweepJobs(store: Store, now: Date, epochSeconds: number): Promise<SweepResult> {
  return store.transaction(async (tx) => {
    let requeued = 0;
    let expired = 0;
    for (const job of await tx.jobs.overdue(now)) {
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
