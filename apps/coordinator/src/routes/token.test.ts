import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { TOKEN, type Address } from '@minera/shared';
import { createTokenWatcher, readTokenSupply, type TokenReader, type TokenSupplySnapshot } from '../chain/token.ts';
import { createTestApp } from '../testing/testApp.ts';

const UNIT = 10n ** 18n;
const PROJECT = TOKEN.supply!.nonCirculating[0]!;

const SNAPSHOT: TokenSupplySnapshot = {
  blockNumber: 90_128_230n,
  timestamp: 1_792_150_000n,
  minted: 1_000_000_000n * UNIT,
  burned: 20_180_830_680436559869274524n,
  held: [{ address: PROJECT.address, label: PROJECT.label, balance: 20_798_958_425335365950673376n }],
};

describe('token supply routes', () => {
  it('serve the supply as JSON, from the snapshot, on the token\'s network', async () => {
    const { app, token } = await createTestApp({ NETWORK: 'mainnet' });
    token.snapshot = SNAPSHOT;
    const response = await app.inject({ method: 'GET', url: '/v1/token' });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.symbol, TOKEN.symbol);
    assert.equal(body.address, TOKEN.address);
    assert.equal(body.chainId, 4663);
    assert.equal(body.maxSupply, '1000000000');
    assert.equal(body.burned, '20180830.680436559869274524');
    assert.equal(body.totalSupply, '979819169.319563440130725476');
    assert.equal(body.circulatingSupply, '959020210.8942280741800521');
    assert.deepEqual(body.nonCirculating, [{ address: PROJECT.address, label: PROJECT.label, balance: '20798958.425335365950673376' }]);
    assert.deepEqual(body.asOf, { block: '90128230', time: new Date(1_792_150_000_000).toISOString() });
    await app.close();
  });

  it('serve each figure as a plain number for listing sites', async () => {
    const { app, token } = await createTestApp({ NETWORK: 'mainnet' });
    token.snapshot = SNAPSHOT;
    const expected: Record<string, string> = {
      '/v1/token/total-supply': '979819169.319563440130725476',
      '/v1/token/circulating-supply': '959020210.8942280741800521',
      '/v1/token/max-supply': '1000000000',
    };
    for (const [url, value] of Object.entries(expected)) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200, url);
      assert.match(String(response.headers['content-type']), /^text\/plain/);
      assert.equal(response.body, value);
    }
    await app.close();
  });

  it('answer 503 until the supply has been read', async () => {
    const { app } = await createTestApp({ NETWORK: 'mainnet' });
    const response = await app.inject({ method: 'GET', url: '/v1/token/circulating-supply' });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'not_ready');
    await app.close();
  });

  it('answer 404 on a network the token does not live on', async () => {
    const { app, token } = await createTestApp({ NETWORK: 'testnet' });
    token.snapshot = SNAPSHOT;
    for (const url of ['/v1/token', '/v1/token/total-supply', '/v1/token/circulating-supply', '/v1/token/max-supply']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404, url);
      assert.equal(response.json().error.code, 'token_not_on_network');
    }
    await app.close();
  });
});

describe('readTokenSupply', () => {
  it('reads every balance at one block', async () => {
    const reads: { functionName: string; args?: readonly unknown[]; blockNumber?: bigint }[] = [];
    const balances: Record<string, bigint> = {
      '0x000000000000000000000000000000000000dEaD': 5n,
      [PROJECT.address]: 7n,
    };
    const client = {
      getBlock: async () => ({ number: 42n, timestamp: 1_000n }),
      readContract: async (call: { functionName: string; args?: readonly unknown[]; blockNumber?: bigint }) => {
        reads.push(call);
        return call.functionName === 'totalSupply' ? 100n : (balances[String(call.args?.[0])] ?? 0n);
      },
    } as unknown as TokenReader;
    const snapshot = await readTokenSupply(client, TOKEN.address as Address, TOKEN.supply!);
    assert.deepEqual(snapshot, {
      blockNumber: 42n,
      timestamp: 1_000n,
      minted: 100n,
      burned: 5n,
      held: [{ address: PROJECT.address, label: PROJECT.label, balance: 7n }],
    });
    assert.ok(reads.every((call) => call.blockNumber === 42n));
  });

  it('keeps the newest snapshot', async () => {
    const snapshots = [{ ...SNAPSHOT, blockNumber: 10n }, { ...SNAPSHOT, blockNumber: 9n }];
    const watcher = createTokenWatcher(async () => snapshots.shift()!);
    await watcher.refresh();
    await watcher.refresh();
    assert.equal(watcher.current()?.blockNumber, 10n);
  });
});
