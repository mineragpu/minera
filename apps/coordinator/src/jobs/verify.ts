import type { JobRecord } from '../store/records.ts';
import { passesKnownAnswer } from './knownAnswer.ts';
import { normalizeOutput } from './normalize.ts';

export type Judgement =
  /** A benchmark or challenge, checked against its known answer. */
  | { type: 'check'; passed: boolean }
  /** A compared job whose twin has not returned yet. */
  | { type: 'await-twin'; twin: JobRecord }
  /** Both rigs returned; the outputs agree or they do not. */
  | { type: 'twin'; match: boolean; twin: JobRecord }
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

/** Decide what a result proves, given the other jobs in its group as they stand. */
export function judge(job: JobRecord, output: string, group: readonly JobRecord[]): Judgement {
  if (job.kind !== 'chat') {
    return { type: 'check', passed: job.expected !== null && passesKnownAnswer(output, job.expected, question(job)) };
  }
  const twin = group.find((other) => other.id !== job.id);
  if (!twin) return { type: 'unchecked' };
  if (twin.status === 'done' && twin.output !== null) {
    return { type: 'twin', match: outputsMatch(output, twin.output), twin };
  }
  if (twin.status === 'queued' || twin.status === 'assigned') return { type: 'await-twin', twin };
  return { type: 'unchecked' };
}
