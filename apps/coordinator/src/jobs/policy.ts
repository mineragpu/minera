import type { JobKind } from '@dayagpu/shared';

/** Scheduling limits. Tuned for a small testnet fleet running small local models. */
export const JOB_POLICY = {
  /** Jobs a rig may hold at once. */
  maxInFlight: 2,
  /** Seconds a rig has to return a result, per kind. A benchmark may include loading the model. */
  deadlineSeconds: { chat: 120, challenge: 60, benchmark: 300 } satisfies Record<JobKind, number>,
  /** Assignments a chat job gets before it is dropped. */
  maxAttempts: 3,
  /** A playground prompt nobody picks up within this time is dropped. */
  playgroundTtlSeconds: 300,
  /** A check addressed to a rig that does not pick it up within this time is dropped. */
  checkTtlSeconds: 600,
  /** Time between known-answer challenges sent to the same rig. */
  challengeIntervalSeconds: 900,
  /** Queued playground prompts accepted before new ones are turned away. */
  maxQueuedPlayground: 200,
  /** Longest output a rig may return. */
  maxOutputChars: 32_000,
  /** Output budget for checks, whose answer is a single number. */
  checkMaxTokens: 16,
} as const;

/** Seeds fit a signed 32-bit integer, which every local runtime accepts. */
export const MAX_SEED = 2_147_483_647;

export function deadlineFor(kind: JobKind, now: Date): Date {
  return new Date(now.getTime() + JOB_POLICY.deadlineSeconds[kind] * 1000);
}
