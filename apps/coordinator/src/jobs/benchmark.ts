import type { JobAssignment } from '@minera/shared';
import type { Random } from '../random.ts';
import type { RigRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { checkModel, createCheck } from './checks.ts';
import { deadlineFor } from './policy.ts';
import { toAssignment } from './wire.ts';

/**
 * Hand a rig that just said hello its benchmark: a known-answer job it must pass before it gets
 * open jobs. A benchmark from an earlier hello is withdrawn, so only the latest one counts.
 */
export async function issueBenchmark(
  store: Store,
  rig: RigRecord,
  preferredModel: string,
  now: Date,
  random: Random,
): Promise<JobAssignment | null> {
  const model = checkModel(rig, preferredModel);
  if (!model) return null;
  return store.transaction(async (tx) => {
    for (const open of await tx.jobs.openChecks(rig.nodeKey)) {
      if (open.kind === 'benchmark') await tx.jobs.close(open.id, 'cancelled', now);
    }
    const id = await createCheck(tx, rig, 'benchmark', model, now, random);
    await tx.jobs.assign(id, rig.nodeKey, now, deadlineFor('benchmark', now));
    const job = await tx.jobs.get(id);
    if (!job) throw new Error(`benchmark ${id} was not stored`);
    return toAssignment(job);
  });
}
