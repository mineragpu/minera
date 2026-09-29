import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { NODE_ROUTES, type JobAssignment, type JobResultRequest, type RuntimeInfo } from '@dayagpu/shared';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CoordinatorError, createCoordinatorClient } from './client.ts';
import { createLogger, type Logger } from './logger.ts';
import { runNode, type NodeLoopOptions } from './loop.ts';
import { signerOf, startMockServer, type MockHandler, type MockServer } from './mock-server.ts';
import { createJobRunner, JobFailedError, type JobRunner } from './runner.ts';
import { createBackoff } from './wait.ts';

const account = privateKeyToAccount(generatePrivateKey());
const runtime: RuntimeInfo = { runtime: 'api-chat', version: '0.12.3', models: ['alpha:7b'] };
const rig = {
  nodeKey: account.address,
  operator: '0x00000000000000000000000000000000000000bb',
  name: 'Night Shift',
  pair: '0x0000000000000000000000000000000000000000',
};

function job(id: string, kind: JobAssignment['kind'] = 'chat'): JobAssignment {
  return {
    id,
    kind,
    model: 'alpha:7b',
    params: { temperature: 0, seed: 9, maxTokens: 32 },
    messages: [{ role: 'user', content: `prompt for ${id}` }],
    deadlineSeconds: 60,
  };
}

function capturingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const sink = { write: (chunk: string) => lines.push(chunk) };
  return { logger: createLogger({ format: 'text', quiet: false, stdout: sink, stderr: sink }), lines };
}

function resultPath(url: string): string | null {
  const match = /^\/v1\/node\/jobs\/([^/]+)\/result$/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

interface Harness {
  coordinator: MockServer;
  stop: AbortController;
  abort: AbortController;
  options: NodeLoopOptions;
  lines: string[];
}

async function harness(handler: MockHandler, runJob: JobRunner): Promise<Harness> {
  const coordinator = await startMockServer(handler);
  const stop = new AbortController();
  const abort = new AbortController();
  const { logger, lines } = capturingLogger();
  const options: NodeLoopOptions = {
    client: createCoordinatorClient({ baseUrl: coordinator.url, signer: account, userAgent: 'rig-test' }),
    runJob,
    readRuntime: async () => runtime,
    runtime,
    gpu: { model: 'Card A', vramMb: 8192 },
    clientVersion: '0.0.0',
    concurrency: 1,
    logger,
    stop: stop.signal,
    abort: abort.signal,
    createBackoff: () => createBackoff({ baseMs: 5, random: () => 0 }),
  };
  return { coordinator, stop, abort, options, lines };
}

describe('runNode', () => {
  it('says hello, runs the benchmark, takes jobs from heartbeats and uploads each result', async () => {
    const results = new Map<string, JobResultRequest>();
    let heartbeats = 0;
    const runtimeServer = await startMockServer((request) => {
      const body = JSON.parse(request.body.toString('utf8')) as { messages: { content: string }[] };
      const prompt = body.messages[0]?.content ?? '';
      return {
        json: {
          message: { role: 'assistant', content: `answer to ${prompt}` },
          prompt_eval_count: 4,
          eval_count: 6,
          total_duration: 250_000_000,
        },
      };
    });
    let stopNode = (): void => undefined;
    const run = await harness((request) => {
      if (request.url === NODE_ROUTES.hello) {
        return { json: { rig, heartbeatSeconds: 5, benchmark: job('bench-1', 'benchmark') } };
      }
      if (request.url === NODE_ROUTES.heartbeat) {
        heartbeats += 1;
        return { json: { heartbeatSeconds: 5, jobs: heartbeats === 1 ? [job('job-1'), job('job-1')] : [] } };
      }
      const id = resultPath(request.url);
      if (id) {
        results.set(id, JSON.parse(request.body.toString('utf8')) as JobResultRequest);
        if (results.size === 2) stopNode();
        return { json: { accepted: true } };
      }
      return { status: 404 };
    }, createJobRunner(runtimeServer.url));
    stopNode = () => run.stop.abort();

    try {
      await runNode(run.options);

      assert.deepEqual([...results.keys()], ['bench-1', 'job-1']);
      assert.deepEqual(results.get('job-1'), {
        output: 'answer to prompt for job-1',
        reported: { promptTokens: 4, completionTokens: 6, durationMs: 250 },
      });
      assert.equal(runtimeServer.requests.length, 2);

      const routes = run.coordinator.requests.map((request) => request.url);
      assert.equal(routes[0], NODE_ROUTES.hello);
      assert.equal(routes[1], '/v1/node/jobs/bench-1/result', 'the benchmark runs before the first heartbeat');
      for (const request of run.coordinator.requests) assert.equal(await signerOf(request), account.address);

      const hello = JSON.parse(run.coordinator.requests[0]?.body.toString('utf8') ?? '');
      const gpu = { model: 'Card A', vramMb: 8192 };
      assert.deepEqual(hello, { protocol: 1, clientVersion: '0.0.0', gpu, runtime });
      const beat = run.coordinator.requests.find((request) => request.url === NODE_ROUTES.heartbeat);
      assert.deepEqual(JSON.parse(beat?.body.toString('utf8') ?? ''), { load: { busy: false, queue: 0 }, runtime });
      assert.ok(run.lines.some((line) => line.includes('Connected as rig "Night Shift"') && line.includes('ETH')));
    } finally {
      await run.coordinator.close();
      await runtimeServer.close();
    }
  });

  it('retries an unreachable coordinator with backoff, then connects', async () => {
    let attempts = 0;
    const run = await harness((request) => {
      if (request.url === NODE_ROUTES.hello) {
        attempts += 1;
        if (attempts < 3) return { status: 503, json: { error: 'starting up' } };
        return { json: { rig, heartbeatSeconds: 5, benchmark: null } };
      }
      run.stop.abort();
      return { json: { heartbeatSeconds: 5, jobs: [] } };
    }, createJobRunner('http://127.0.0.1:1'));
    try {
      await runNode(run.options);
      assert.equal(attempts, 3);
      assert.equal(run.lines.filter((line) => line.includes('HTTP 503: starting up. Retrying in')).length, 2);
    } finally {
      await run.coordinator.close();
    }
  });

  it('stops with the reason when the coordinator refuses the node', async () => {
    const run = await harness(
      () => ({ status: 403, json: { error: 'unknown rig' } }),
      createJobRunner('http://127.0.0.1:1'),
    );
    try {
      await assert.rejects(runNode(run.options), (error: CoordinatorError) => {
        assert.equal(error.status, 403);
        assert.match(error.message, /unknown rig/);
        return true;
      });
      assert.equal(run.coordinator.requests.length, 1);
    } finally {
      await run.coordinator.close();
    }
  });

  it('finishes and uploads the running job on a graceful stop', async () => {
    let release = (): void => undefined;
    const uploaded: string[] = [];
    const runJob: JobRunner = () =>
      new Promise((resolve) => {
        release = () => resolve({ output: 'done', reported: { promptTokens: 1, completionTokens: 1, durationMs: 1 } });
      });
    const run = await harness((request) => {
      if (request.url === NODE_ROUTES.hello) return { json: { rig, heartbeatSeconds: 5, benchmark: null } };
      if (request.url === NODE_ROUTES.heartbeat) {
        setTimeout(() => {
          run.stop.abort();
          setTimeout(() => release(), 20);
        }, 20);
        return { json: { heartbeatSeconds: 5, jobs: [job('job-1'), job('job-2')] } };
      }
      uploaded.push(resultPath(request.url) ?? '');
      return { json: { accepted: true } };
    }, runJob);
    try {
      await runNode(run.options);
      assert.deepEqual(uploaded, ['job-1']);
      assert.ok(run.lines.some((line) => line.includes('Dropped 1 queued jobs')));
      assert.ok(run.lines.some((line) => line.includes('Waiting for 1 running job to finish')));
    } finally {
      await run.coordinator.close();
    }
  });

  it('abandons the running job on a hard stop and uploads nothing', async () => {
    const uploaded: string[] = [];
    const runJob: JobRunner = (_job, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new JobFailedError('stopped', 'stopped')), { once: true });
      });
    const run = await harness((request) => {
      if (request.url === NODE_ROUTES.hello) return { json: { rig, heartbeatSeconds: 5, benchmark: null } };
      if (request.url === NODE_ROUTES.heartbeat) {
        setTimeout(() => {
          run.stop.abort();
          run.abort.abort();
        }, 20);
        return { json: { heartbeatSeconds: 5, jobs: [job('job-1')] } };
      }
      uploaded.push(request.url);
      return { json: { accepted: true } };
    }, runJob);
    try {
      await runNode(run.options);
      assert.deepEqual(uploaded, []);
      assert.ok(run.lines.some((line) => line.includes('Abandoned job job-1')));
    } finally {
      await run.coordinator.close();
    }
  });
});
