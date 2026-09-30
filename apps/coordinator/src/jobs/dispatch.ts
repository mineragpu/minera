import type { HeartbeatRequest, JobAssignment } from '@minera/shared';
import type { Random } from '../random.ts';
import type { JobRecord, RigRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { checkModel, createCheck, isQualified } from './checks.ts';
import { JOB_POLICY, deadlineFor } from './policy.ts';
import { toAssignment } from './wire.ts';

async function challengeIfDue(
  tx: Store,
  rig: RigRecord,
  preferredModel: string,
  now: Date,
  random: Random,
): Promise<void> {
  const model = checkModel(rig, preferredModel);
  if (!model) return;
  if ((await tx.jobs.openChecks(rig.nodeKey)).length > 0) return;
  // The hello benchmark counts as a check too, so the interval runs from whichever came last.
  const since = Math.max(rig.lastChallengeAt?.getTime() ?? 0, rig.helloAt?.getTime() ?? 0);
  if (now.getTime() - since < JOB_POLICY.challengeIntervalSeconds * 1000) return;
  await createCheck(tx, rig, 'challenge', model, now, random);
  await tx.rigs.markChallenged(rig.nodeKey, now);
}

/** At most one job per group, so a rig never holds both sides of a comparison. */
function onePerGroup(jobs: readonly JobRecord[], limit: number): JobRecord[] {
  const groups = new Set<string>();
  const picked: JobRecord[] = [];
  for (const job of jobs) {
    if (picked.length >= limit) break;
    if (groups.has(job.groupId)) continue;
    groups.add(job.groupId);
    picked.push(job);
  }
  return picked;
}

/**
 * Assign work to a rig on its heartbeat: a challenge when one is due, then queued jobs for the
 * models it serves, up to its free capacity. Open jobs only go to a qualified rig.
 */
export async function assignJobs(
  store: Store,
  rig: RigRecord,
  load: HeartbeatRequest['load'],
  preferredModel: string,
  now: Date,
  random: Random,
): Promise<JobAssignment[]> {
  return store.transaction(async (tx) => {
    await challengeIfDue(tx, rig, preferredModel, now, random);
    const capacity = load.busy ? 0 : JOB_POLICY.maxInFlight - (await tx.jobs.inFlight(rig.nodeKey));
    if (capacity <= 0) return [];

    const candidates = await tx.jobs.assignable({ rig, qualified: isQualified(rig), now, limit: capacity * 2 });
    const picked = onePerGroup(candidates, capacity);
    const assignments: JobAssignment[] = [];
    for (const job of picked) {
      await tx.jobs.assign(job.id, rig.nodeKey, now, deadlineFor(job.kind, now));
      assignments.push(toAssignment(job));
    }
    return assignments;
  });
}
