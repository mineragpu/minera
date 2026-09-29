/**
 * The node's life with the coordinator: say hello, run the benchmark, then send heartbeats and run
 * the jobs they carry until asked to stop.
 *
 * Two signals drive shutdown. `stop` ends heartbeats and drops queued jobs but lets running jobs
 * finish and upload. `abort` also abandons running jobs, which the coordinator reassigns.
 */

import {
  PROTOCOL_VERSION,
  type GpuInfo,
  type HelloRequest,
  type HelloResponse,
  type JobAssignment,
  type JobResultRequest,
  type RuntimeInfo,
} from '@dayagpu/shared';
import { CoordinatorError, type CoordinatorClient } from './client.ts';
import type { Logger } from './logger.ts';
import { JobFailedError, type JobRunner } from './runner.ts';
import { createScheduler } from './scheduler.ts';
import { createBackoff, sleep, type Backoff } from './wait.ts';

export interface NodeLoopOptions {
  client: CoordinatorClient;
  runJob: JobRunner;
  /** Re-reads the runtime before each heartbeat; null when it stopped answering. */
  readRuntime: () => Promise<RuntimeInfo | null>;
  runtime: RuntimeInfo;
  gpu: GpuInfo | null;
  clientVersion: string;
  concurrency: number;
  logger: Logger;
  stop: AbortSignal;
  abort: AbortSignal;
  createBackoff?: () => Backoff;
}

const MIN_HEARTBEAT_SECONDS = 5;
const MAX_HEARTBEAT_SECONDS = 300;
const ETH_PAIR = '0x0000000000000000000000000000000000000000';

function inSeconds(ms: number): string {
  return (ms / 1000).toFixed(ms < 10_000 ? 1 : 0);
}

function heartbeatDelayMs(seconds: number): number {
  return Math.min(MAX_HEARTBEAT_SECONDS, Math.max(MIN_HEARTBEAT_SECONDS, seconds)) * 1000;
}

function retryable(error: unknown): error is CoordinatorError {
  return error instanceof CoordinatorError && error.retryable;
}

export async function runNode(options: NodeLoopOptions): Promise<void> {
  const { client, logger, stop } = options;
  const newBackoff = options.createBackoff ?? (() => createBackoff());
  const backoff = newBackoff();
  const halt = new AbortController();
  const jobSignal = AbortSignal.any([options.abort, halt.signal]);
  const scheduler = createScheduler(options.concurrency, executeJob);

  async function submit(job: JobAssignment, result: JobResultRequest, deadline: number): Promise<void> {
    const retry = newBackoff();
    while (!jobSignal.aborted) {
      try {
        const verdict = await client.submitResult(job.id, result);
        if (verdict.accepted) {
          logger.info(`The coordinator accepted job ${job.id}.`, { job: job.id, accepted: true });
        } else {
          const reason = verdict.reason ? `: ${verdict.reason}` : '';
          logger.warn(`The coordinator rejected job ${job.id}${reason}.`, { job: job.id, accepted: false });
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!retryable(error)) {
          logger.warn(`Could not submit job ${job.id}. ${message}`, { job: job.id });
          return;
        }
        const delay = retry.next();
        if (performance.now() + delay > deadline) {
          logger.warn(`Gave up submitting job ${job.id} before its deadline. ${message}`, { job: job.id });
          return;
        }
        logger.warn(`Could not submit job ${job.id} yet. ${message} Retrying in ${inSeconds(delay)} s.`);
        await sleep(delay, jobSignal);
      }
    }
  }

  async function executeJob(job: JobAssignment, receivedAt: number): Promise<void> {
    const deadline = receivedAt + job.deadlineSeconds * 1000;
    const remainingSeconds = (deadline - performance.now()) / 1000;
    if (remainingSeconds < 1) {
      logger.warn(`Skipped job ${job.id}: its deadline passed while it waited in the queue.`, { job: job.id });
      return;
    }
    const fields = { job: job.id, kind: job.kind, model: job.model };
    logger.info(`Running ${job.kind} job ${job.id} on ${job.model}.`, fields);
    let result: JobResultRequest;
    try {
      result = await options.runJob({ ...job, deadlineSeconds: remainingSeconds }, jobSignal);
    } catch (error) {
      if (error instanceof JobFailedError && error.failure === 'stopped') {
        logger.warn(`Abandoned job ${job.id}; the coordinator will reassign it.`, { job: job.id });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Job ${job.id} failed. ${message}`, { job: job.id });
      }
      return;
    }
    const { durationMs, completionTokens } = result.reported;
    logger.info(`Finished job ${job.id} in ${inSeconds(durationMs)} s with ${completionTokens} tokens.`, {
      job: job.id,
      durationMs,
      completionTokens,
    });
    await submit(job, result, deadline);
  }

  async function hello(): Promise<HelloResponse | null> {
    const request: HelloRequest = {
      protocol: PROTOCOL_VERSION,
      clientVersion: options.clientVersion,
      gpu: options.gpu,
      runtime: options.runtime,
    };
    while (!stop.aborted) {
      try {
        return await client.hello(request);
      } catch (error) {
        if (!retryable(error)) throw error;
        const delay = backoff.next();
        logger.warn(`${error.message} Retrying in ${inSeconds(delay)} s.`);
        await sleep(delay, stop);
      }
    }
    return null;
  }

  async function heartbeats(firstInterval: number): Promise<void> {
    let lastRuntime = options.runtime;
    let runtimeLost = false;
    let interval = firstInterval;
    while (!stop.aborted) {
      const runtime = await options.readRuntime();
      if (runtime === null && !runtimeLost) {
        logger.warn('The model runtime stopped answering. Reporting no models until it is back.');
      } else if (runtime !== null && runtimeLost) {
        logger.info('The model runtime is answering again.');
      }
      runtimeLost = runtime === null;
      lastRuntime = runtime ?? lastRuntime;

      try {
        const reply = await client.heartbeat({
          load: { busy: scheduler.running >= options.concurrency, queue: scheduler.queued },
          runtime: runtime ?? { ...lastRuntime, models: [] },
        });
        backoff.reset();
        interval = reply.heartbeatSeconds;
        for (const reason of reply.rejected) logger.warn(`Skipped a job the coordinator sent. ${reason}`);
        scheduler.add(reply.jobs);
      } catch (error) {
        if (!retryable(error)) throw error;
        const delay = backoff.next();
        logger.warn(`${error.message} Retrying in ${inSeconds(delay)} s.`);
        await sleep(delay, stop);
        continue;
      }
      await sleep(heartbeatDelayMs(interval), stop);
    }
  }

  try {
    const welcome = await hello();
    if (welcome === null) return;
    const { rig } = welcome;
    const pair = rig.pair.toLowerCase() === ETH_PAIR ? 'ETH' : rig.pair;
    logger.info(`Connected as rig "${rig.name}", operated by ${rig.operator} and paired with ${pair}.`, {
      rig: rig.name,
      operator: rig.operator,
      pair: rig.pair,
    });

    if (welcome.benchmark !== null) {
      logger.info('Running the benchmark before taking paid jobs.');
      scheduler.add([welcome.benchmark]);
      await scheduler.drained();
    }
    await heartbeats(welcome.heartbeatSeconds);
  } catch (error) {
    halt.abort();
    throw error;
  } finally {
    const dropped = scheduler.close();
    if (dropped > 0) logger.info(`Dropped ${dropped} queued jobs; the coordinator will reassign them.`);
    if (scheduler.running > 0 && !jobSignal.aborted) {
      logger.info(`Waiting for ${scheduler.running} running job${scheduler.running === 1 ? '' : 's'} to finish.`);
    }
    await scheduler.drained();
  }
}
