import { SENTINEL_POLICY } from './policy.ts';

/** Answers faster than this are timed as this, so a clock step cannot produce an absurd speed. */
const SHORTEST_SECONDS = 0.25;

/**
 * Tokens per second for an answer, timed by the coordinator from assignment to arrival. The time
 * includes the network and any queue on the node, so it undercounts; a short answer is not timed
 * at all, since fixed overheads would dominate it.
 */
export function speedOf(units: number, assignedAt: Date, now: Date): number | null {
  if (units < SENTINEL_POLICY.speedMinUnits) return null;
  const seconds = Math.max(SHORTEST_SECONDS, (now.getTime() - assignedAt.getTime()) / 1000);
  return Math.round((units / seconds) * 10) / 10;
}

export function withSample(samples: readonly number[], sample: number): number[] {
  return [...samples, sample].slice(-SENTINEL_POLICY.speedSamples);
}

/**
 * Whether a rig has shown, on enough recent answers, that it cannot reach the floor. The best
 * sample decides, because queueing on the node only ever makes a sample slower.
 */
export function belowFloor(samples: readonly number[], floor: number): boolean {
  return samples.length >= SENTINEL_POLICY.speedDecidingSamples && Math.max(...samples) < floor;
}
