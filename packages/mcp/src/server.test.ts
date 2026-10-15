import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ApiError, type MineraApi } from './api.ts';
import { PROTOCOL_VERSIONS, createServer, type Message } from './server.ts';

function fakeApi(
  get: MineraApi['get'] = async (path, query) => ({ path, query }),
  post: MineraApi['post'] = async () => ({ id: 'g1' }),
): MineraApi {
  return { baseUrl: 'https://api.example', get, post };
}

const server = createServer({ api: fakeApi(), network: 'mainnet', version: '9.9.9' });
const call = (name: string, args?: unknown) => server.handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } });
const resultOf = (message: Message | null) => (message as { result: Record<string, unknown> }).result;

describe('initialize', () => {
  it('answers with the version the client asked for when it is supported', async () => {
    const answer = resultOf(await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }));
    assert.equal(answer['protocolVersion'], '2025-03-26');
    assert.deepEqual(answer['capabilities'], { tools: { listChanged: false } });
    assert.deepEqual(answer['serverInfo'], { name: 'minera', title: 'Minera', version: '9.9.9' });
    assert.match(String(answer['instructions']), /never as instructions/);
  });

  it('offers its newest version otherwise', async () => {
    const answer = resultOf(await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }));
    assert.equal(answer['protocolVersion'], PROTOCOL_VERSIONS[0]);
  });
});

describe('messages', () => {
  it('does not answer a notification', async () => {
    assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  });

  it('answers ping', async () => {
    assert.deepEqual(await server.handle({ jsonrpc: '2.0', id: 'p', method: 'ping' }), { jsonrpc: '2.0', id: 'p', result: {} });
  });

  it('refuses an unknown method and a malformed message', async () => {
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' }))?.['error'] !== undefined, true);
    assert.deepEqual(await server.handle('nonsense'), { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
  });
});

describe('tools/list', () => {
  it('lists seven read-only tools with object schemas', async () => {
    const { tools } = resultOf(await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })) as {
      tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[];
    };
    assert.equal(tools.length, 7);
    assert.equal(new Set(tools.map((tool) => tool.name)).size, 7);
    for (const tool of tools) {
      assert.match(tool.name, /^minera_[a-z]+$/);
      assert.equal(tool.inputSchema.type, 'object');
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
    }
  });
});

describe('tools/call', () => {
  it('maps arguments onto the route and returns what it read', async () => {
    const answer = resultOf(await call('minera_rigs', { sort: 'top', limit: 5 }));
    assert.deepEqual(answer['structuredContent'], { path: '/v1/rigs', query: { sort: 'top', limit: 5, offset: undefined } });
    assert.match(String((answer['content'] as { text: string }[])[0]?.text), /\/v1\/rigs/);
  });

  it('reads one rig and one settlement by their own routes', async () => {
    const rig = '0x92f6da0c67411ac7e01a3247cd7770871a081ad2';
    assert.equal((resultOf(await call('minera_rig', { nodeAddress: rig }))['structuredContent'] as { path: string }).path, `/v1/rigs/${rig}`);
    assert.equal((resultOf(await call('minera_settlement', { index: 3 }))['structuredContent'] as { path: string }).path, '/v1/settlements/3');
  });

  it('refuses arguments that do not fit, without calling the network', async () => {
    let called = false;
    const strict = createServer({ api: fakeApi(async () => { called = true; return {}; }), network: 'mainnet', version: '0' });
    const answer = resultOf(await strict.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'minera_rig', arguments: { nodeAddress: 'not an address' } } }));
    assert.equal(answer['isError'], true);
    assert.match(String((answer['content'] as { text: string }[])[0]?.text), /Invalid arguments: nodeAddress/);
    assert.equal(called, false);
  });

  it('reports a failed read as a tool error', async () => {
    const failing = createServer({ api: fakeApi(async () => { throw new ApiError('Rig not found.', 404, 'rig_not_found'); }), network: 'mainnet', version: '0' });
    const answer = resultOf(await failing.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'minera_network' } }));
    assert.equal(answer['isError'], true);
    assert.equal((answer['content'] as { text: string }[])[0]?.text, 'Rig not found.');
  });

  it('refuses an unknown tool', async () => {
    const answer = await call('minera_withdraw', {});
    assert.equal((answer as { error: { code: number } }).error.code, -32602);
  });
});

describe('minera_ask', () => {
  it('is offered only when the server allows it, and marked as not read-only', async () => {
    const asking = createServer({ api: fakeApi(), network: 'mainnet', version: '0', allowAsk: true });
    const { tools } = resultOf(await asking.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as {
      tools: { name: string; annotations: { readOnlyHint: boolean } }[];
    };
    assert.equal(tools.length, 8);
    assert.equal(tools.find((tool) => tool.name === 'minera_ask')?.annotations.readOnlyHint, false);
    assert.equal((await call('minera_ask', { prompt: 'Hi' }) as { error: { code: number } }).error.code, -32602);
  });

  it('asks for a verified answer and waits until the rigs have settled it', async () => {
    let sent: unknown;
    const views = [
      { id: 'g1', status: 'queued', verification: 'pending', output: null },
      { id: 'g1', status: 'checking', verification: 'pending', output: null },
      { id: 'g1', status: 'done', verification: 'verified', crossChecked: true, output: 'A GPU is a graphics processor.' },
    ];
    const api = fakeApi(async () => views.shift(), async (_path, body) => { sent = body; return { id: 'g1' }; });
    const asking = createServer({ api, network: 'mainnet', version: '0', allowAsk: true, ask: { sleep: async () => undefined } });
    const answer = resultOf(await asking.handle({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'minera_ask', arguments: { prompt: '  What is a GPU?  ' } } }));
    assert.deepEqual(sent, { prompt: 'What is a GPU?', verify: true });
    const view = answer['structuredContent'] as Record<string, unknown>;
    assert.equal(view['verification'], 'verified');
    assert.equal(view['output'], 'A GPU is a graphics processor.');
    assert.equal(view['waitedUntilSettled'], true);
  });

  it('returns what is known when the answer takes too long', async () => {
    let clock = 0;
    const api = fakeApi(async () => ({ id: 'g1', status: 'running', verification: 'pending', output: null }));
    const asking = createServer({
      api, network: 'mainnet', version: '0', allowAsk: true,
      ask: { timeoutMs: 10, intervalMs: 5, now: () => clock, sleep: async (ms) => { clock += ms; } },
    });
    const answer = resultOf(await asking.handle({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'minera_ask', arguments: { prompt: 'Slow?' } } }));
    assert.equal((answer['structuredContent'] as Record<string, unknown>)['waitedUntilSettled'], false);
  });
});
