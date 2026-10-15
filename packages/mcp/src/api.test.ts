import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ApiError, createApi } from './api.ts';

describe('createApi', () => {
  it('sends a GET to the route with the given query, skipping empty values', async () => {
    let seen: URL | null = null;
    const api = createApi({
      baseUrl: 'https://api.example/',
      fetch: (async (url: URL) => { seen = url; return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as typeof fetch,
    });
    assert.deepEqual(await api.get('/v1/rigs', { sort: 'top', limit: 5, offset: undefined }), { ok: true });
    assert.equal(String(seen), 'https://api.example/v1/rigs?sort=top&limit=5');
  });

  it("raises the coordinator's own error message", async () => {
    const api = createApi({
      baseUrl: 'https://api.example',
      fetch: (async () => new Response(JSON.stringify({ error: { code: 'rig_not_found', message: 'No rig has that node key.' } }), { status: 404 })) as typeof fetch,
    });
    await assert.rejects(api.get('/v1/rigs/0x1'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.message, 'No rig has that node key.');
      assert.equal(error.status, 404);
      assert.equal(error.code, 'rig_not_found');
      return true;
    });
  });

  it('posts JSON for the one write it makes', async () => {
    let init: RequestInit | undefined;
    const api = createApi({
      baseUrl: 'https://api.example',
      fetch: (async (_url: URL, given?: RequestInit) => { init = given; return new Response(JSON.stringify({ id: 'g1' }), { status: 202 }); }) as typeof fetch,
    });
    assert.deepEqual(await api.post('/v1/playground/jobs', { prompt: 'Hi', verify: true }), { id: 'g1' });
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, JSON.stringify({ prompt: 'Hi', verify: true }));
  });

  it('says when the service cannot be reached', async () => {
    const api = createApi({ baseUrl: 'https://api.example', fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    await assert.rejects(api.get('/v1/network'), /could not be reached/);
  });
});
