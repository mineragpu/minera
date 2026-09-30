import type { JobAssignment } from '@minera/shared';
import type { JobRecord } from '../store/records.ts';
import { JOB_POLICY } from './policy.ts';

/** What a node receives. The known answer of a check stays on the coordinator. */
export function toAssignment(job: JobRecord): JobAssignment {
  return {
    id: job.id,
    kind: job.kind,
    model: job.model,
    params: { temperature: 0, seed: job.params.seed, maxTokens: job.params.maxTokens },
    messages: job.messages.map((message) => ({ role: message.role, content: message.content })),
    deadlineSeconds: JOB_POLICY.deadlineSeconds[job.kind],
  };
}
