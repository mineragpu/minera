/**
 * Runs one assigned job on the local model runtime and shapes the result the coordinator expects.
 */

import type { JobAssignment, JobResultRequest } from '@dayagpu/shared';
import { RuntimeError, chat } from './runtime.ts';

export type JobRunner = (job: JobAssignment, stop: AbortSignal) => Promise<JobResultRequest>;

export type JobFailure = 'deadline' | 'stopped' | 'runtime';

export class JobFailedError extends Error {
  readonly failure: JobFailure;

  constructor(message: string, failure: JobFailure) {
    super(message);
    this.name = 'JobFailedError';
    this.failure = failure;
  }
}

/** Time kept back from the deadline so the result can still be uploaded. */
const UPLOAD_MARGIN_MS = 2_000;
const MIN_BUDGET_MS = 1_000;

export function createJobRunner(runtimeUrl: string): JobRunner {
  return async (job, stop) => {
    const budget = AbortSignal.timeout(Math.max(MIN_BUDGET_MS, job.deadlineSeconds * 1000 - UPLOAD_MARGIN_MS));
    const request = {
      model: job.model,
      messages: job.messages,
      seed: job.params.seed,
      maxTokens: job.params.maxTokens,
    };
    try {
      const reply = await chat(runtimeUrl, request, AbortSignal.any([stop, budget]));
      return {
        output: reply.output,
        reported: {
          promptTokens: reply.promptTokens,
          completionTokens: reply.completionTokens,
          durationMs: reply.durationMs,
        },
      };
    } catch (error) {
      if (stop.aborted) throw new JobFailedError('The job was stopped before it finished.', 'stopped');
      if (budget.aborted) {
        throw new JobFailedError(`The job did not finish within its ${job.deadlineSeconds} s deadline.`, 'deadline');
      }
      if (error instanceof RuntimeError) throw new JobFailedError(error.message, 'runtime');
      throw error;
    }
  };
}
