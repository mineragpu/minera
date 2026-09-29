import { keccak256, toBytes } from 'viem';
import type { Address } from '@dayagpu/shared';
import { epochOf } from '../epoch.ts';
import type { JobRecord } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { JOB_POLICY } from './policy.ts';
import { measureUnits } from './units.ts';
import { judge } from './verify.ts';

export interface SubmittedResult {
  nodeKey: Address;
  jobId: string;
  output: string;
  now: Date;
  epochSeconds: number;
}

export type ResultDecision =
  | { kind: 'accepted' }
  | { kind: 'closed'; reason: string }
  | { kind: 'not_found' }
  | { kind: 'not_assignee' };

function closedReason(job: JobRecord): string {
  return job.status === 'done'
    ? 'A result for this job was already received.'
    : 'This job was closed before the result arrived.';
}

/**
 * Store a rig's result and settle what it proves, in one transaction.
 *
 * Only verified work is credited toward rewards: a job whose twin, run by another operator's rig,
 * returned the same output. A job nobody compared is recorded as unverified and earns nothing on
 * its own. Known-answer checks only decide whether a rig may take open jobs; their answers can be
 * computed without a GPU, so they earn nothing. A wrong answer or a disagreement counts as a
 * failed check on each rig involved.
 */
export async function acceptResult(store: Store, result: SubmittedResult): Promise<ResultDecision> {
  const { nodeKey, output, now } = result;
  return store.transaction(async (tx) => {
    const job = await tx.jobs.get(result.jobId);
    if (!job) return { kind: 'not_found' };
    if (job.assignedNode !== nodeKey) return { kind: 'not_assignee' };
    if (job.status !== 'assigned') return { kind: 'closed', reason: closedReason(job) };

    const units = measureUnits(output, job.params.maxTokens);
    const epoch = epochOf(now, result.epochSeconds);
    const judgement = judge(job, output, await tx.jobs.group(job.groupId));
    const outputHash = keccak256(toBytes(output));
    const complete = (verification: JobRecord['verification'], verifiedAt: Date | null) =>
      tx.jobs.complete(job.id, { output, outputHash, units, verification, finishedAt: now, verifiedAt });

    switch (judgement.type) {
      case 'check':
        await complete(judgement.passed ? 'verified' : 'failed', judgement.passed ? now : null);
        await tx.rigs.recordCheck(nodeKey, judgement.passed, now);
        break;
      case 'await-twin':
        await complete('pending', null);
        if (judgement.twin.status === 'queued') {
          await tx.jobs.expireBy(judgement.twin.id, new Date(now.getTime() + JOB_POLICY.twinWaitSeconds * 1000));
        }
        break;
      case 'unchecked':
        await complete('unverified', null);
        await tx.work.credit(nodeKey, epoch, { verified: 0, unverified: units });
        break;
      case 'twin': {
        const { twin, match } = judgement;
        await complete(match ? 'verified' : 'mismatch', match ? now : null);
        await tx.jobs.setVerification(twin.id, match ? 'verified' : 'mismatch', match ? now : null);
        await tx.rigs.recordCheck(nodeKey, match, now);
        if (twin.assignedNode) await tx.rigs.recordCheck(twin.assignedNode, match, now);
        if (match) {
          await tx.work.credit(nodeKey, epoch, { verified: units, unverified: 0 });
          if (twin.assignedNode) {
            await tx.work.credit(twin.assignedNode, epoch, { verified: twin.units ?? 0, unverified: 0 });
          }
        }
        break;
      }
    }
    return { kind: 'accepted' };
  });
}
