import { passesCanary } from '../sentinel/canary.ts';
import type { JobRecord } from '../store/records.ts';
import { passesKnownAnswer } from './knownAnswer.ts';
import { normalizeOutput } from './normalize.ts';

export type Judgement =
  /** A benchmark or challenge, checked against its known answer. */
  | { type: 'check'; passed: boolean }
  /** A canary, checked against the answer independent rigs agreed on. */
  | { type: 'canary'; passed: boolean }
  /** A compared job whose twin has not returned yet. */
  | { type: 'await-twin'; twin: JobRecord }
  /** Both rigs returned; the outputs agree or they do not. */
  | { type: 'twin'; match: boolean; twin: JobRecord }
  /** The third answer to a disagreement: the earlier answer it sides with, if any. */
  | { type: 'tiebreak'; winner: JobRecord | null; answered: JobRecord[] }
  /** Nothing to compare against: the job was never sent twice, or its twin was dropped. */
  | { type: 'unchecked' };

export function outputsMatch(a: string, b: string): boolean {
  return normalizeOutput(a) === normalizeOutput(b);
}

function question(job: JobRecord): string {
  return job.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n');
}

function answered(job: JobRecord): job is JobRecord & { output: string } {
  return job.status === 'done' && job.output !== null;
}

/** Decide what a result proves, given the other jobs in its group as they stand. */
export function judge(job: JobRecord, output: string, group: readonly JobRecord[]): Judgement {
  if (job.kind !== 'chat') {
    return { type: 'check', passed: job.expected !== null && passesKnownAnswer(output, job.expected, question(job)) };
  }
  if (job.origin === 'canary') {
    return { type: 'canary', passed: job.expected !== null && passesCanary(output, job.expected) };
  }
  const others = group.filter((other) => other.id !== job.id);
  if (others.length >= 2) {
    const earlier = others.filter(answered);
    return { type: 'tiebreak', winner: earlier.find((other) => outputsMatch(output, other.output)) ?? null, answered: earlier };
  }
  const twin = others[0];
  if (!twin) return { type: 'unchecked' };
  if (answered(twin)) return { type: 'twin', match: outputsMatch(output, twin.output), twin };
  if (twin.status === 'queued' || twin.status === 'assigned') return { type: 'await-twin', twin };
  return { type: 'unchecked' };
}
