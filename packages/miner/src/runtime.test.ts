import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { startMockServer } from './mock-server.ts';
import { RUNTIME_INTERFACE, detectRuntime, modelNames } from './runtime.ts';

describe('detectRuntime', () => {
  it('reports the version and the installed models', async () => {
    const server = await startMockServer((request) => {
      if (request.url === '/api/version') return { json: { version: '0.12.3' } };
      if (request.url === '/api/tags') return { json: { models: [{ name: 'alpha:7b' }, { name: 'beta:1b' }] } };
      return { status: 404 };
    });
    try {
      assert.deepEqual(await detectRuntime(server.url), {
        runtime: RUNTIME_INTERFACE,
        version: '0.12.3',
        models: ['alpha:7b', 'beta:1b'],
      });
    } finally {
      await server.close();
    }
  });

  it('reports no models when the model list is unavailable', async () => {
    const server = await startMockServer((request) =>
      request.url === '/api/version' ? { json: { version: '0.12.3' } } : { status: 500 },
    );
    try {
      assert.deepEqual((await detectRuntime(server.url))?.models, []);
    } finally {
      await server.close();
    }
  });

  it('leaves out a version the coordinator would refuse', async () => {
    const server = await startMockServer((request) =>
      request.url === '/api/version' ? { json: { version: '0.12.3 (build 7)' } } : { json: { models: [] } },
    );
    try {
      assert.deepEqual(await detectRuntime(server.url), { runtime: RUNTIME_INTERFACE, models: [] });
    } finally {
      await server.close();
    }
  });

  it('returns null when the server is not a compatible runtime', async () => {
    const server = await startMockServer(() => ({ status: 404, text: 'not found' }));
    try {
      assert.equal(await detectRuntime(server.url), null);
    } finally {
      await server.close();
    }
  });

  it('returns null when nothing listens', async () => {
    const server = await startMockServer(() => ({ json: {} }));
    await server.close();
    assert.equal(await detectRuntime(server.url), null);
  });
});

describe('modelNames', () => {
  it('keeps unique, printable names and ignores junk', () => {
    const tooLong = { name: 'x'.repeat(201) };
    const tags = { models: [{ name: 'a' }, { model: 'b' }, { name: 'a' }, { name: '' }, { name: 42 }, 'c', tooLong] };
    assert.deepEqual(modelNames(tags), ['a', 'b']);
    assert.deepEqual(modelNames(null), []);
    assert.deepEqual(modelNames({ models: 'a' }), []);
  });

  it('reports only names the coordinator accepts, and at most 64 of them', () => {
    const names = ['hf.co/team/model-GGUF:Q4_K_M', 'my model', "x'; DROP TABLE rigs", 'ok:1b', 'y'.repeat(129)];
    assert.deepEqual(modelNames({ models: names.map((name) => ({ name })) }), ['hf.co/team/model-GGUF:Q4_K_M', 'ok:1b']);
    const many = { models: Array.from({ length: 80 }, (_, i) => ({ name: `model-${i}:1b` })) };
    assert.equal(modelNames(many).length, 64);
  });
});
