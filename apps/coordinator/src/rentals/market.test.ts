import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { rentalConfig } from '../testing/rentals.ts';
import { MarketError, createMarketClient } from './market.ts';

interface Call {
  method: string;
  url: string;
  body: unknown;
  authorization: string | null;
}

function marketWith(answer: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      authorization: headers.get('authorization'),
    };
    calls.push(call);
    const { status, body } = answer(call);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { market: createMarketClient(rentalConfig().market, fetcher), calls };
}

describe('the GPU marketplace client', () => {
  it('asks for reliable on-demand single cards and takes the cheapest within the cap', async () => {
    const { market, calls } = marketWith(() => ({
      status: 200,
      body: {
        offers: [
          { id: 7, gpu_name: 'Card A', gpu_ram: 8192, dph_total: 0.0812 },
          { id: 8, gpu_name: 'Card B', gpu_ram: 12288, dph_total: 0.09 },
        ],
      },
    }));
    const offer = await market.cheapestOffer();
    assert.deepEqual(offer, { id: '7', gpu: 'Card A', vramMb: 8192, usdPerHourMicros: 81_200n });
    const [call] = calls;
    assert.equal(call?.url, 'https://market.example/api/v0/bundles/');
    assert.equal(call?.authorization, `Bearer ${'k'.repeat(32)}`);
    const query = call?.body as Record<string, unknown>;
    assert.equal(query.type, 'on-demand');
    assert.deepEqual(query.num_gpus, { eq: 1 });
    assert.deepEqual(query.gpu_ram, { gte: 8_000 });
    assert.deepEqual(query.reliability, { gte: 0.98 });
    assert.deepEqual(query.order, [['dph_total', 'asc']]);
  });

  it('offers nothing when the cheapest machine is over the cap', async () => {
    const { market } = marketWith(() => ({
      status: 200,
      body: { offers: [{ id: 9, gpu_name: 'Card C', gpu_ram: 24576, dph_total: 0.31 }] },
    }));
    assert.equal(await market.cheapestOffer(), null);
  });

  it('launches with the image, label and start script, and reports a taken offer', async () => {
    const { market, calls } = marketWith((call) =>
      call.url.endsWith('/asks/7/') ? { status: 200, body: { success: true, new_contract: 4242 } } : { status: 410 },
    );
    assert.equal(await market.launch({ offerId: '7', label: 'minera-rental-x', onstart: 'echo hi' }), '4242');
    const body = calls[0]?.body as Record<string, unknown>;
    assert.equal(calls[0]?.method, 'PUT');
    assert.deepEqual([body.image, body.label, body.onstart, body.cancel_unavail], ['example/rig-base:cuda-12', 'minera-rental-x', 'echo hi', true]);
    assert.equal(await market.launch({ offerId: '8', label: 'minera-rental-y', onstart: '' }), null);
    await assert.rejects(market.launch({ offerId: '7; rm', label: 'x', onstart: '' }), MarketError);
  });

  it('reads machine states and destroys machines, gone ones included', async () => {
    const states: Record<string, unknown> = { '1': 'running', '2': 'loading', '3': 'exited' };
    const { market, calls } = marketWith((call) => {
      const id = /instances\/(\d+)\//.exec(call.url)?.[1] ?? '';
      if (call.method === 'DELETE') return { status: id === '4' ? 404 : 200, body: { success: true } };
      return id in states ? { status: 200, body: { instances: { actual_status: states[id] } } } : { status: 200, body: { instances: null } };
    });
    assert.equal((await market.machine('1')).state, 'running');
    assert.equal((await market.machine('2')).state, 'starting');
    assert.equal((await market.machine('3')).state, 'failed');
    assert.equal((await market.machine('4')).state, 'gone');
    await market.destroy('3');
    await market.destroy('4');
    assert.deepEqual(
      calls.filter((call) => call.method === 'DELETE').map((call) => call.url),
      ['https://market.example/api/v0/instances/3/', 'https://market.example/api/v0/instances/4/'],
    );
  });

  it('lists labelled machines across pages', async () => {
    const { market } = marketWith((call) =>
      call.url.includes('after_token=p2')
        ? { status: 200, body: { instances: [{ id: 3, label: 'minera-rental-c' }], next_token: null } }
        : {
            status: 200,
            body: { instances: [{ id: 1, label: 'minera-rental-a' }, { id: 2, label: 'other' }], next_token: 'p2' },
          },
    );
    assert.deepEqual(await market.labelled('minera-rental-'), [
      { instanceId: '1', label: 'minera-rental-a' },
      { instanceId: '3', label: 'minera-rental-c' },
    ]);
  });

  it('marks rate limits and server errors as worth retrying', async () => {
    const { market } = marketWith(() => ({ status: 429 }));
    await assert.rejects(market.cheapestOffer(), (error: unknown) => error instanceof MarketError && error.retryable);
    const refused = marketWith(() => ({ status: 401 })).market;
    await assert.rejects(refused.cheapestOffer(), (error: unknown) => error instanceof MarketError && !error.retryable);
  });
});
