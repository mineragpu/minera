/**
 * Holds assigned jobs and runs up to `concurrency` of them at once, each job id only once.
 */

import type { JobAssignment } from '@dayagpu/shared';

/**
 * Runs one job and reports its own failures; a rejection is ignored so one job cannot stop the
 * others. `receivedAt` is the `performance.now()` reading when the job was queued.
 */
export type JobExecutor = (job: JobAssignment, receivedAt: number) => Promise<void>;

export interface Scheduler {
  /** Queues jobs whose ids were not seen before and starts as many as there is room for. */
  add(jobs: readonly JobAssignment[]): number;
  readonly running: number;
  readonly queued: number;
  /** Starts nothing more and drops the queue. Returns how many queued jobs were dropped. */
  close(): number;
  /** Resolves once no job is running. */
  drained(): Promise<void>;
}

export const MAX_CONCURRENCY = 4;
const REMEMBERED_IDS = 4_096;

export function createScheduler(concurrency: number, execute: JobExecutor): Scheduler {
  const queue: { job: JobAssignment; receivedAt: number }[] = [];
  const seen = new Set<string>();
  const waiters: (() => void)[] = [];
  let running = 0;
  let closed = false;

  function remember(id: string): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > REMEMBERED_IDS) {
      const oldest = seen.values().next();
      if (!oldest.done) seen.delete(oldest.value);
    }
    return true;
  }

  function settle(): void {
    running -= 1;
    pump();
    if (running === 0) waiters.splice(0).forEach((resolve) => resolve());
  }

  function pump(): void {
    while (!closed && running < concurrency) {
      const next = queue.shift();
      if (!next) return;
      running += 1;
      execute(next.job, next.receivedAt)
        .catch(() => undefined)
        .finally(settle);
    }
  }

  return {
    add(jobs) {
      if (closed) return 0;
      let added = 0;
      for (const job of jobs) {
        if (!remember(job.id)) continue;
        queue.push({ job, receivedAt: performance.now() });
        added += 1;
      }
      pump();
      return added;
    },
    get running() {
      return running;
    },
    get queued() {
      return queue.length;
    },
    close() {
      closed = true;
      return queue.splice(0).length;
    },
    drained() {
      return running === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve));
    },
  };
}
