import type { Address } from '@minera/shared';
import type { JobRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';

/** `checking`: an answer is in and a second rig is still working on the same prompt. */
export type PlaygroundStatus = 'queued' | 'running' | 'checking' | 'done' | 'expired';
export type PlaygroundVerification = 'pending' | 'verified' | 'unverified' | 'mismatch';

export interface PlaygroundView {
  id: string;
  status: PlaygroundStatus;
  prompt: string;
  /** Withheld until no rig is still working on the prompt. */
  output: string | null;
  rig: { nodeKey: Address; name: string } | null;
  /** Whether a second rig's answer was actually compared with this one. */
  crossChecked: boolean;
  verification: PlaygroundVerification;
  createdAt: Date;
  finishedAt: Date | null;
}

function isOpen(job: JobRecord): boolean {
  return job.status === 'queued' || job.status === 'assigned';
}

function statusOf(group: readonly JobRecord[], answer: JobRecord | undefined): PlaygroundStatus {
  if (group.some(isOpen)) {
    if (answer) return 'checking';
    return group.some((job) => job.status === 'assigned') ? 'running' : 'queued';
  }
  return answer ? 'done' : 'expired';
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

/**
 * The playground's view of a prompt: the first answer returned and how far it was checked.
 *
 * The answer stays hidden while any rig still holds the prompt. A rig holding the second copy
 * could otherwise read the first rig's answer here and submit it as its own, and both would be
 * credited as verified.
 */
export async function viewPlaygroundJob(store: Store, id: string): Promise<PlaygroundView | null> {
  const group = await store.jobs.group(id);
  const first = group[0];
  if (!first || group.some((job) => job.kind !== 'chat')) return null;

  const settled = !group.some(isOpen);
  const answer = group
    .filter((job) => job.status === 'done' && job.finishedAt !== null)
    .sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0))[0];
  const shown = settled ? answer : undefined;
  const rig = shown?.assignedNode ? await store.rigs.get(shown.assignedNode) : null;
  const verification = verificationOf(shown);
  return {
    id,
    status: statusOf(group, answer),
    prompt: first.messages.find((message) => message.role === 'user')?.content ?? '',
    output: shown?.output ?? null,
    rig: rig ? { nodeKey: rig.nodeKey, name: rig.name } : null,
    crossChecked: verification === 'verified' || verification === 'mismatch',
    verification,
    createdAt: first.createdAt,
    finishedAt: shown?.finishedAt ?? null,
  };
}
