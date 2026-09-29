import type { Random } from '../random.ts';
import type { NewJob } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { JOB_POLICY, MAX_SEED } from './policy.ts';

export interface PlaygroundSettings {
  model: string;
  maxTokens: number;
  /** Share of prompts also sent to a second rig, so the two answers can be compared. */
  redundancyRate: number;
}

export class PlaygroundBusyError extends Error {
  override name = 'PlaygroundBusyError';
}

const SYSTEM = 'You are a helpful assistant. Answer clearly and briefly.';

/**
 * Queue a visitor's prompt, sometimes twice, and return its public id. The public id is the group
 * id, which no rig ever receives, so a rig cannot look up its own prompt on the playground.
 */
export async function submitPlaygroundJob(
  store: Store,
  settings: PlaygroundSettings,
  prompt: string,
  now: Date,
  random: Random,
): Promise<string> {
  return store.transaction(async (tx) => {
    if ((await tx.jobs.queuedCount('chat')) >= JOB_POLICY.maxQueuedPlayground) throw new PlaygroundBusyError();
    const groupId = random.uuid();
    const job: NewJob = {
      id: random.uuid(),
      groupId,
      kind: 'chat',
      model: settings.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      params: { temperature: 0, seed: random.int(MAX_SEED), maxTokens: settings.maxTokens },
      expected: null,
      targetNode: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + JOB_POLICY.playgroundTtlSeconds * 1000),
    };
    await tx.jobs.insert(job);
    if (random.chance(settings.redundancyRate)) await tx.jobs.insert({ ...job, id: random.uuid() });
    return groupId;
  });
}
