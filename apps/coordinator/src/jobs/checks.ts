import type { Random } from '../random.ts';
import type { JobRecord, RigRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { knownAnswerPrompt } from './knownAnswer.ts';
import { JOB_POLICY, MAX_SEED } from './policy.ts';

/** Checks run on the playground model when the rig serves it, since that is what open jobs use. */
export function checkModel(rig: RigRecord, preferred: string): string | null {
  if (rig.models.includes(preferred)) return preferred;
  return rig.models[0] ?? null;
}

/** Queue a known-answer job addressed to one rig. */
export async function createCheck(
  tx: Store,
  rig: RigRecord,
  kind: 'benchmark' | 'challenge',
  model: string,
  now: Date,
  random: Random,
): Promise<JobRecord['id']> {
  const prompt = knownAnswerPrompt(random);
  const id = random.uuid();
  await tx.jobs.insert({
    id,
    groupId: id,
    kind,
    model,
    messages: prompt.messages,
    params: { temperature: 0, seed: random.int(MAX_SEED), maxTokens: JOB_POLICY.checkMaxTokens },
    expected: prompt.expected,
    targetNode: rig.nodeKey,
    createdAt: now,
    expiresAt: new Date(now.getTime() + JOB_POLICY.checkTtlSeconds * 1000),
  });
  return id;
}

/** A rig takes open jobs once it has passed a check since its latest hello. */
export function isQualified(rig: RigRecord): boolean {
  if (rig.qualifiedAt === null) return false;
  return rig.helloAt === null || rig.qualifiedAt >= rig.helloAt;
}
