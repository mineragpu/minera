import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { CHAINS, NODE_HEADERS, NODE_ROUTES, type HelloRequest, type JobAssignment } from '@minera/shared';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CoordinatorError, createCoordinatorClient } from './client.ts';
import { signerOf, startMockServer, type MockHandler, type RecordedRequest } from './mock-server.ts';

const account = privateKeyToAccount(generatePrivateKey());
const CHAIN_ID = CHAINS.testnet.id;
const hello: HelloRequest = {
  protocol: 1,
  clientVersion: '0.0.0',
  gpu: null,
  runtime: { runtime: 'api-chat', models: ['alpha:7b'] },
};
const rig = {
  nodeKey: account.address,
  operator: '0x00000000000000000000000000000000000000bb',
  name: 'Night Shift',
  pair: '0x0000000000000000000000000000000000000000',
};
const job: JobAssignment = {
  id: 'job/1',
  kind: 'chat',
  model: 'alpha:7b',
  params: { temperature: 0, seed: 7, maxTokens: 64 },
  messages: [{ role: 'user', content: 'hi' }],
  deadlineSeconds: 60,
};

async function withCoordinator(
  handler: MockHandler,
  test: (url: string, requests: RecordedRequest[]) => Promise<void>,
): Promise<void> {
  const server = await startMockServer(handler);
  try {
    await test(server.url, server.requests);
  } finally {
    await server.close();
  }
}

function client(baseUrl: string) {
  return createCoordinatorClient({
    baseUrl,
    signer: account,
    chainId: CHAIN_ID,
    userAgent: 'rig-test/0.0.0',
    timeoutMs: 2_000,
  });
}

describe('createCoordinatorClient', () => {
  it('signs each call so the coordinator recovers the node key', async () => {
    await withCoordinator(
      (request) => {
        if (request.url === NODE_ROUTES.hello) return { json: { rig, heartbeatSeconds: 15, benchmark: null } };
        if (request.url === NODE_ROUTES.heartbeat) return { json: { heartbeatSeconds: 15, jobs: [job] } };
        return { json: { accepted: true } };
      },
      async (url, requests) => {
        const coordinator = client(url);
        assert.equal((await coordinator.hello(hello)).rig.name, 'Night Shift');
        const heartbeat = await coordinator.heartbeat({ load: { busy: false, queue: 0 }, runtime: hello.runtime });
        assert.deepEqual(heartbeat.jobs, [job]);
        const reported = { promptTokens: 3, completionTokens: 5, durationMs: 40 };
        assert.deepEqual(await coordinator.submitResult(job.id, { output: 'hello', reported }), { accepted: true });

        assert.deepEqual(
          requests.map((request) => `${request.method} ${request.url}`),
          ['POST /v1/node/hello', 'POST /v1/node/heartbeat', 'POST /v1/node/jobs/job%2F1/result'],
        );
        for (const request of requests) {
          assert.equal(request.headers[NODE_HEADERS.key], account.address);
          assert.equal(request.headers['content-type'], 'application/json');
          assert.equal(await signerOf(request, CHAIN_ID), account.address);
        }
        assert.deepEqual(JSON.parse(requests[2]?.body.toString('utf8') ?? ''), { output: 'hello', reported });
      },
    );
  });

  it('signs the full path when the coordinator sits under a prefix', async () => {
    await withCoordinator(
      () => ({ json: { rig, heartbeatSeconds: 15, benchmark: null } }),
      async (url, requests) => {
        await client(`${url}/api/`).hello(hello);
        assert.equal(requests[0]?.url, '/api/v1/node/hello');
        assert.equal(await signerOf(requests[0] as RecordedRequest, CHAIN_ID), account.address);
      },
    );
  });

  it('marks server errors and rate limits as retryable', async () => {
    for (const status of [429, 500, 503]) {
      await withCoordinator(
        () => ({ status, json: { error: 'busy rigs' } }),
        async (url) => {
          await assert.rejects(client(url).hello(hello), (error: CoordinatorError) => {
            assert.equal(error.status, status);
            assert.equal(error.retryable, true);
            assert.match(error.message, new RegExp(`HTTP ${status}: busy rigs`));
            return true;
          });
        },
      );
    }
  });

  it('marks refusals as final and passes on the reason', async () => {
    await withCoordinator(
      () => ({ status: 403, json: { message: 'This node key is not a deployed rig.' } }),
      async (url) => {
        await assert.rejects(client(url).hello(hello), (error: CoordinatorError) => {
          assert.equal(error.retryable, false);
          assert.equal(error.message, 'The coordinator answered HTTP 403: This node key is not a deployed rig.');
          return true;
        });
      },
    );
  });

  it('points at the clock when a 401 comes from a coordinator with a different time', async () => {
    const date = new Date(Date.now() - 600_000).toUTCString();
    await withCoordinator(
      () => ({ status: 401, json: { error: 'stale request' }, headers: { date } }),
      async (url) => {
        await assert.rejects(client(url).hello(hello), /clock is about \d+ seconds ahead of/);
      },
    );
  });

  it('rejects replies that are not JSON or not the protocol', async () => {
    await withCoordinator(
      () => ({ text: '<html>login</html>' }),
      async (url) => {
        await assert.rejects(client(url).hello(hello), { retryable: false, message: /not JSON/ });
      },
    );
    await withCoordinator(
      () => ({ json: { ok: true } }),
      async (url) => {
        await assert.rejects(client(url).hello(hello), { retryable: false, message: /cannot use/ });
      },
    );
  });

  it('refuses to follow a redirect', async () => {
    await withCoordinator(
      () => ({ status: 307, headers: { location: 'http://127.0.0.1:1/elsewhere' } }),
      async (url) => {
        await assert.rejects(client(url).hello(hello), { retryable: false, message: /redirects/ });
      },
    );
  });

  it('reports an unreachable coordinator as retryable', async () => {
    const server = await startMockServer(() => ({ json: {} }));
    await server.close();
    await assert.rejects(client(server.url).hello(hello), (error: CoordinatorError) => {
      assert.equal(error.status, null);
      assert.equal(error.retryable, true);
      assert.match(error.message, /Could not reach the coordinator/);
      return true;
    });
  });
});
