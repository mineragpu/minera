import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { CHAINS, NODE_ROUTES, type Address, type JobAssignment } from '@minera/shared';
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

async function send(account: PrivateKeyAccount, path: string, payload: unknown, remoteAddress = '203.0.113.7') {
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
    headers: { ...headers, 'content-type': 'application/json' },
    payload: body,
    remoteAddress,
  });
}

async function identityGate(): Promise<{ passed: number; blocked: number } | undefined> {
  const counts = await harness.store.sentinel.gateCounts(new Date(0));
  const identity = counts.find((entry) => entry.gate === 'identity');
  return identity && { passed: identity.passed, blocked: identity.blocked };
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
      null,
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

  it('makes a rig wait between hellos, so it cannot reset its checks at will', async () => {
    assert.equal((await send(rig, NODE_ROUTES.hello, hello)).statusCode, 200);
    const early = await send(rig, NODE_ROUTES.hello, hello);
    assert.equal(early.statusCode, 429);
    assert.equal(early.json().error.code, 'hello_cooldown');
    harness.clock.now = new Date(harness.clock.now.getTime() + 61_000);
    assert.equal((await send(rig, NODE_ROUTES.hello, hello)).statusCode, 200);
    assert.deepEqual(await identityGate(), { passed: 2, blocked: 1 });
  });

  it('caps the signed requests one key may send in a minute', async () => {
    await send(rig, NODE_ROUTES.hello, hello);
    const statuses: number[] = [];
    for (let i = 0; i < 60; i += 1) statuses.push((await send(rig, NODE_ROUTES.heartbeat, heartbeat)).statusCode);
    assert.deepEqual([...new Set(statuses.slice(0, 59))], [200]);
    const over = await send(rig, NODE_ROUTES.heartbeat, heartbeat);
    assert.deepEqual([statuses[59], over.statusCode, over.json().error.code], [429, 429, 'rate_limited']);
    harness.clock.now = new Date(harness.clock.now.getTime() + 60_000);
    assert.equal((await send(rig, NODE_ROUTES.heartbeat, heartbeat)).statusCode, 200);
  });

  it('counts refused signatures at the identity gate', async () => {
    await harness.app.inject({ method: 'POST', url: NODE_ROUTES.hello, payload: hello });
    await send(privateKeyToAccount(generatePrivateKey()), NODE_ROUTES.hello, hello);
    assert.deepEqual(await identityGate(), { passed: 0, blocked: 2 });
  });

  it('keeps the rig network as a keyed digest of its subnet, and the card id it reports', async () => {
    const withCard = { ...hello, gpu: { ...hello.gpu, uuid: 'GPU-3f2a9c1e-7b4d-4e8a-9c21-5d6e7f809a1b' } };
    assert.equal((await send(rig, NODE_ROUTES.hello, withCard, '198.51.100.23')).statusCode, 200);
    const stored = await harness.store.rigs.get(rig.address.toLowerCase() as Address);
    assert.equal(stored?.gpu?.uuid, 'GPU-3f2a9c1e-7b4d-4e8a-9c21-5d6e7f809a1b');
    assert.match(stored?.network ?? '', /^[0-9a-f]{24}$/);
    assert.equal(stored?.network?.includes('198'), false);

    await send(rig, NODE_ROUTES.heartbeat, heartbeat, '198.51.100.99');
    assert.equal((await harness.store.rigs.get(rig.address.toLowerCase() as Address))?.network, stored?.network);
    await send(rig, NODE_ROUTES.heartbeat, heartbeat, '198.51.101.99');
    assert.notEqual((await harness.store.rigs.get(rig.address.toLowerCase() as Address))?.network, stored?.network);

    const badCard = { ...hello, gpu: { ...hello.gpu, uuid: 'not a card id' } };
    harness.clock.now = new Date(harness.clock.now.getTime() + 61_000);
    assert.equal((await send(rig, NODE_ROUTES.hello, badCard)).statusCode, 400);
  });

  it('holds every reported name to the shape honest clients send', async () => {
    const honest = {
      ...hello,
      clientVersion: '0.2.0-rc.1',
      gpu: { model: 'Test Accelerator X1 (24 GB)', vramMb: 24_576, driver: '551.86' },
      runtime: { runtime: 'api-chat', version: '0.12.3', models: ['hf.co/team/model-GGUF:Q4_K_M', MODEL] },
    };
    assert.equal((await send(rig, NODE_ROUTES.hello, honest)).statusCode, 200);

    const refused = [
      { ...honest, clientVersion: '0.2.0; rm -rf /' },
      { ...honest, gpu: { ...honest.gpu, model: 'Card\u001b[2J' } },
      { ...honest, gpu: { ...honest.gpu, driver: "551.86' OR '1'='1" } },
      { ...honest, runtime: { ...honest.runtime, runtime: 'api chat' } },
      { ...honest, runtime: { ...honest.runtime, version: '0.12.3\n' } },
      { ...honest, runtime: { ...honest.runtime, models: ["x'); DROP TABLE rigs; --"] } },
    ];
    for (const [i, body] of refused.entries()) {
      harness.clock.now = new Date(harness.clock.now.getTime() + 61_000);
      const response = await send(rig, NODE_ROUTES.hello, body);
      assert.equal(response.statusCode, 400, `case ${i}`);
      assert.equal(response.json().error.code, 'invalid_request');
    }
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
