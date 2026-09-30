import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { JobAssignment } from '@minera/shared';
import { startMockServer, type MockHandler, type MockServer } from './mock-server.ts';
import { JobFailedError, createJobRunner } from './runner.ts';

const job: JobAssignment = {
  id: 'job-1',
  kind: 'chat',
  model: 'alpha:7b',
  params: { temperature: 0, seed: 1234, maxTokens: 96 },
  messages: [
    { role: 'system', content: 'Answer in one word.' },
    { role: 'user', content: 'Capital of France?' },
  ],
  deadlineSeconds: 60,
};

const reply = {
  model: 'alpha:7b',
  message: { role: 'assistant', content: 'Paris' },
  done: true,
  total_duration: 1_534_000_000,
  prompt_eval_count: 21,
  eval_count: 2,
};

async function withRuntime(handler: MockHandler, test: (server: MockServer) => Promise<void>): Promise<void> {
  const server = await startMockServer(handler);
  try {
    await test(server);
  } finally {
    await server.close();
  }
}

describe('createJobRunner', () => {
  it('sends the job to the chat endpoint with deterministic options', async () => {
    await withRuntime(
      () => ({ json: reply }),
      async (server) => {
        await createJobRunner(server.url)(job, new AbortController().signal);
        assert.equal(server.requests.length, 1);
        const [request] = server.requests;
        assert.equal(request?.method, 'POST');
        assert.equal(request?.url, '/api/chat');
        assert.deepEqual(JSON.parse(request?.body.toString('utf8') ?? ''), {
          model: 'alpha:7b',
          messages: job.messages,
          stream: false,
          options: { temperature: 0, seed: 1234, num_predict: 96 },
        });
      },
    );
  });

  it('reports the output with the runtime counts and duration', async () => {
    await withRuntime(
      () => ({ json: reply }),
      async (server) => {
        const result = await createJobRunner(server.url)(job, new AbortController().signal);
        assert.deepEqual(result, {
          output: 'Paris',
          reported: { promptTokens: 21, completionTokens: 2, durationMs: 1534 },
        });
      },
    );
  });

  it('accepts a deadline that is not a whole number of seconds', async () => {
    await withRuntime(
      () => ({ json: reply }),
      async (server) => {
        const run = createJobRunner(server.url);
        const result = await run({ ...job, deadlineSeconds: 57.3219 }, new AbortController().signal);
        assert.equal(result.output, 'Paris');
      },
    );
  });

  it('reports zero counts and a measured duration when the runtime omits them', async () => {
    await withRuntime(
      () => ({ json: { message: { role: 'assistant', content: '' } } }),
      async (server) => {
        const result = await createJobRunner(server.url)(job, new AbortController().signal);
        assert.equal(result.output, '');
        assert.equal(result.reported.promptTokens, 0);
        assert.equal(result.reported.completionTokens, 0);
        assert.ok(result.reported.durationMs >= 0);
      },
    );
  });

  it('fails with the runtime reason when the model is missing', async () => {
    await withRuntime(
      () => ({ status: 404, json: { error: 'model "alpha:7b" not found, try pulling it first' } }),
      async (server) => {
        const run = createJobRunner(server.url);
        await assert.rejects(run(job, new AbortController().signal), (error: JobFailedError) => {
          assert.equal(error.failure, 'runtime');
          assert.match(error.message, /HTTP 404: model "alpha:7b" not found/);
          return true;
        });
      },
    );
  });

  it('fails when the reply has no message', async () => {
    await withRuntime(
      () => ({ json: { done: true } }),
      async (server) => {
        await assert.rejects(createJobRunner(server.url)(job, new AbortController().signal), {
          failure: 'runtime',
          message: /without a message/,
        });
      },
    );
  });

  it('gives up at the deadline', async () => {
    await withRuntime(
      () => new Promise(() => undefined),
      async (server) => {
        const started = Date.now();
        const run = createJobRunner(server.url);
        const stop = new AbortController().signal;
        await assert.rejects(run({ ...job, deadlineSeconds: 1 }, stop), { failure: 'deadline' });
        assert.ok(Date.now() - started < 5_000);
      },
    );
  });

  it('stops when asked', async () => {
    await withRuntime(
      () => new Promise(() => undefined),
      async (server) => {
        const stop = new AbortController();
        setTimeout(() => stop.abort(), 50);
        await assert.rejects(createJobRunner(server.url)(job, stop.signal), { failure: 'stopped' });
      },
    );
  });
});
