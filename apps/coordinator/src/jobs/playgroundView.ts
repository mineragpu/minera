import type { Address } from '@dayagpu/shared';
import type { JobRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';

export type PlaygroundStatus = 'queued' | 'running' | 'done' | 'expired';
export type PlaygroundVerification = 'pending' | 'verified' | 'unverified' | 'mismatch';

export interface PlaygroundView {
  id: string;
  status: PlaygroundStatus;
  prompt: string;
  output: string | null;
  rig: { nodeKey: Address; name: string } | null;
  /** Whether a second rig's answer was actually compared with this one. */
  crossChecked: boolean;
  verification: PlaygroundVerification;
  createdAt: Date;
  finishedAt: Date | null;
}

function statusOf(group: readonly JobRecord[], answer: JobRecord | undefined): PlaygroundStatus {
  if (answer) return 'done';
  if (group.some((job) => job.status === 'assigned')) return 'running';
  if (group.some((job) => job.status === 'queued')) return 'queued';
  return 'expired';
}

function verificationOf(answer: JobRecord | undefined): PlaygroundVerification {
  switch (answer?.verification) {
    case 'verified':
    case 'unverified':
    case 'mismatch':
      return answer.verification;
    default:
      return 'pending';
  }
}

/** The playground's view of a prompt: the first answer returned and how far it was checked. */
export async function viewPlaygroundJob(store: Store, id: string): Promise<PlaygroundView | null> {
  const group = await store.jobs.group(id);
  const primary = group.find((job) => job.id === id);
  if (!primary || primary.kind !== 'chat') return null;

  const answer = group
    .filter((job) => job.status === 'done' && job.finishedAt !== null)
    .sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0))[0];
  const rig = answer?.assignedNode ? await store.rigs.get(answer.assignedNode) : null;
  const verification = verificationOf(answer);
  return {
    id,
    status: statusOf(group, answer),
    prompt: primary.messages.find((message) => message.role === 'user')?.content ?? '',
    output: answer?.output ?? null,
    rig: rig ? { nodeKey: rig.nodeKey, name: rig.name } : null,
    crossChecked: verification === 'verified' || verification === 'mismatch',
    verification,
    createdAt: primary.createdAt,
    finishedAt: answer?.finishedAt ?? null,
  };
}
