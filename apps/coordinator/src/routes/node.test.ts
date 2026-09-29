import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { CHAINS, NODE_ROUTES, type Address, type JobAssignment } from '@dayagpu/shared';
import { submitPlaygroundJob } from '../jobs/playground.ts';
import { viewPlaygroundJob } from '../jobs/playgroundView.ts';
import { signNodeRequest } from '../testing/nodeSigner.ts';
import { seededRandom } from '../testing/seededRandom.ts';
import { createTestApp, type TestApp } from '../testing/testApp.ts';

const MODEL = 'llama3.2:1b';
const RUNTIME = { runtime: 'local', version: '1.2.3', models: [MODEL] };
const OPERATOR = '0x00000000000000000000000000000000000000a1' as Address;
const ETH = '0x0000000000000000000000000000000000000000' as Address;

let harness: TestApp;
let rig: PrivateKeyAccount;

async function send(account: PrivateKeyAccount, path: string, payload: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(payload);
  const headers = await signNodeRequest(account, {
    chainId: harness.config.chain.id,
    method: 'POST',
    path,
    body,
    timestamp: Math.floor(harness.clock.now.getTime() / 1000),
  });
  return harness.app.inject({
    method: 'POST',
    url: path,
    headers: { ...headers, 'content-type': 'application/json', ...extra },
    payload: body,
  });
}

function answer(assignment: JobAssignment): string {
  const question = assignment.messages.find((message) => message.role === 'user')?.content ?? '';
  const [, a, operator, b] = /(\d+) (plus|minus|times) (\d+)/.exec(question) ?? [];
  const x = Number(a);
  const y = Number(b);
  return String(operator === 'plus' ? x + y : operator === 'minus' ? x - y : x * y);
}

const hello = { protocol: 1, clientVersion: '0.1.0', gpu: { model: 'card', vramMb: 8_192 }, runtime: RUNTIME };
const heartbeat = { load: { busy: false, queue: 0 }, runtime: RUNTIME };
const reported = { promptTokens: 1, completionTokens: 1, durationMs: 5 };

beforeEach(async () => {
  harness = await createTestApp();
  rig = privateKeyToAccount(generatePrivateKey());
  await harness.store.rigs.deploy({
    nodeKey: rig.address.toLowerCase() as Address,
    operator: OPERATOR,
    pair: '0x0000000000000000000000000000000000000000',
    name: 'basement',
    deployedAt: new Date('2026-09-28T00:00:00Z'),
    deployedBlock: 126_000_000n,
  });
});

afterEach(async () => {
  await harness.app.close();
});

describe('node routes', () => {
  it('greets a deployed rig with its record and a benchmark', async () => {
    const response = await send(rig, NODE_ROUTES.hello, hello);
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(body.rig, { nodeKey: rig.address.toLowerCase(), operator: OPERATOR, name: 'basement', pair: ETH });
    assert.equal(body.heartbeatSeconds, 30);
    assert.equal(body.benchmark.kind, 'benchmark');
    assert.equal(body.benchmark.model, MODEL);
    assert.equal(body.benchmark.expected, undefined);
  });

  it('refuses unsigned, unknown and replayed requests with the error shape', async () => {
    const unsigned = await harness.app.inject({ method: 'POST', url: NODE_ROUTES.hello, payload: hello });
    assert.equal(unsigned.statusCode, 401);
    assert.equal(unsigned.json().error.code, 'missing_header');

    const stranger = await send(privateKeyToAccount(generatePrivateKey()), NODE_ROUTES.hello, hello);
    assert.equal(stranger.statusCode, 403);
    assert.deepEqual(Object.keys(stranger.json().error), ['code', 'message']);

    const body = JSON.stringify(heartbeat);
    const headers = await signNodeRequest(rig, {
      chainId: harness.config.chain.id,
      method: 'POST',
      path: NODE_ROUTES.heartbeat,
      body,
      timestamp: Math.floor(harness.clock.now.getTime() / 1000),
    });
    const request = {
      method: 'POST' as const,
      url: NODE_ROUTES.heartbeat,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: body,
    };
    assert.equal((await harness.app.inject(request)).statusCode, 200);
    const replay = await harness.app.inject(request);
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.json().error.code, 'replayed_request');
  });

  it('refuses a request signed for another network', async () => {
    assert.equal(harness.config.chain.id, CHAINS.testnet.id);
    const body = JSON.stringify(hello);
    const headers = await signNodeRequest(rig, {
      chainId: CHAINS.mainnet.id,
      method: 'POST',
      path: NODE_ROUTES.hello,
      body,
      timestamp: Math.floor(harness.clock.now.getTime() / 1000),
    });
    const response = await harness.app.inject({
      method: 'POST',
      url: NODE_ROUTES.hello,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: body,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'bad_signature');
  });

  it('validates the body after authenticating', async () => {
    const response = await send(rig, NODE_ROUTES.hello, { ...hello, protocol: 2 });
    assert.equal(response.statusCode, 400);
    const { error } = response.json();
    assert.equal(error.code, 'invalid_request');
    assert.equal(error.details[0].path, 'body.protocol');
  });

  it('hands out open jobs after the benchmark passes, and takes results only from the assignee', async () => {
    const { benchmark } = (await send(rig, NODE_ROUTES.hello, hello)).json();
    const id = await submitPlaygroundJob(
      harness.store,
      { model: MODEL, maxTokens: 64, redundancyRate: 0 },
      'Say hello',
      harness.clock.now,
      seededRandom(9),
    );
    assert.deepEqual((await send(rig, NODE_ROUTES.heartbeat, heartbeat)).json().jobs, []);

    const passed = await send(rig, NODE_ROUTES.result(benchmark.id), { output: answer(benchmark), reported });
    assert.deepEqual(passed.json(), { accepted: true });
    const { jobs } = (await send(rig, NODE_ROUTES.heartbeat, heartbeat)).json();
    assert.deepEqual(jobs.map((job: JobAssignment) => [job.kind, job.params.temperature]), [['chat', 0]]);
    const chat: JobAssignment = jobs[0];
    assert.notEqual(chat.id, id);

    const other = privateKeyToAccount(generatePrivateKey());
    await harness.store.rigs.deploy({
      nodeKey: other.address.toLowerCase() as Address,
      operator: OPERATOR,
      pair: '0x0000000000000000000000000000000000000000',
      name: 'garage',
      deployedAt: new Date('2026-09-28T00:00:00Z'),
      deployedBlock: 126_000_001n,
    });
    const stolen = await send(other, NODE_ROUTES.result(chat.id), { output: 'Hello', reported });
    assert.equal(stolen.statusCode, 403);
    assert.equal(stolen.json().error.code, 'not_assignee');

    const accepted = await send(rig, NODE_ROUTES.result(chat.id), { output: 'Hello.', reported });
    assert.deepEqual(accepted.json(), { accepted: true });
    const again = await send(rig, NODE_ROUTES.result(chat.id), { output: 'Hello.', reported });
    assert.deepEqual(again.json(), { accepted: false, reason: 'A result for this job was already received.' });

    const view = await viewPlaygroundJob(harness.store, id);
    assert.deepEqual(
      [view?.status, view?.output, view?.rig?.name, view?.crossChecked, view?.verification],
      ['done', 'Hello.', 'basement', false, 'unverified'],
    );
  });

  it('rejects malformed job ids, unknown jobs and oversized output', async () => {
    assert.equal((await send(rig, NODE_ROUTES.result('not-a-job'), { output: 'x', reported })).statusCode, 400);
    const unknown = NODE_ROUTES.result('00000000-0000-4000-8000-00000000ffff');
    const missing = await send(rig, unknown, { output: 'x', reported });
    assert.equal(missing.statusCode, 404);
    const huge = await send(rig, unknown, { output: 'x'.repeat(32_001), reported });
    assert.equal(huge.statusCode, 400);
  });
});
