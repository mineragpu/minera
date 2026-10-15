import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { MineraApi } from '@minera-gpu/mcp/api';
import { formatCount, formatEth, gatherFacts } from './facts.ts';

const NETWORK = {
  network: 'mainnet',
  chainId: 4663,
  rigs: { total: 12, online: 9 },
  last24h: { verifiedUnits: '1234567', jobsCompleted: { chat: 4321, benchmark: 3, challenge: 40 } },
  pool: { totalBurned: '1500000000000000', committed: '250000000000000', asOf: { block: '89062830', time: '2026-10-15T07:57:11.000Z' } },
  campaign: { id: '1', burns: 3 },
  epoch: { index: 497791, seconds: 3600 },
};

const RIGS = {
  total: 12,
  rigs: [
    { name: 'mufty', verifiedUnits: { epoch: '900' } },
    { name: 'atlas', verifiedUnits: { epoch: '20' } },
    { name: '', verifiedUnits: { epoch: '5' } },
    { name: 'idle', verifiedUnits: { epoch: '0' } },
  ],
};

describe('formatEth', () => {
  it('keeps at most six decimals and drops trailing zeros', () => {
    assert.equal(formatEth('1500000000000000'), '0.0015');
    assert.equal(formatEth(1_234_567_890_123_456_789n), '1.234567');
    assert.equal(formatEth('2000000000000000000'), '2');
    assert.equal(formatEth('0'), '0');
  });

  it('shows an amount under a millionth of an ETH as 0', () => {
    assert.equal(formatEth('999999999999'), '0');
  });
});

describe('formatCount', () => {
  it('adds thousands separators', () => {
    assert.equal(formatCount('1234567'), '1,234,567');
    assert.equal(formatCount(999), '999');
    assert.equal(formatCount(1000n), '1,000');
  });
});

describe('gatherFacts', () => {
  it('reads the network and the top rigs this epoch', async () => {
    const asked: unknown[] = [];
    const api: MineraApi = {
      baseUrl: 'https://api.example',
      async get(path, query) {
        asked.push([path, query]);
        return path === '/v1/network' ? NETWORK : RIGS;
      },
      async post() {
        throw new Error('gathering facts never posts');
      },
    };
    assert.deepEqual(await gatherFacts(api), {
      network: 'mainnet',
      chainId: 4663,
      rigsTotal: 12,
      rigsOnline: 9,
      verifiedUnits24h: '1234567',
      answers24h: 4321,
      poolBurned: '1500000000000000',
      poolCommitted: '250000000000000',
      campaignBurns: 3,
      epoch: 497791,
      topRigs: ['mufty', 'atlas'],
      asOf: '2026-10-15T07:57:11.000Z',
    });
    assert.deepEqual(asked, [
      ['/v1/network', undefined],
      ['/v1/rigs', { sort: 'epoch', limit: 3 }],
    ]);
  });

  it('falls back to zeros when a field is missing', async () => {
    const api: MineraApi = { baseUrl: 'https://api.example', get: async () => ({}), post: async () => ({}) };
    const facts = await gatherFacts(api);
    assert.equal(facts.rigsOnline, 0);
    assert.equal(facts.poolBurned, '0');
    assert.deepEqual(facts.topRigs, []);
    assert.equal(facts.asOf, '');
  });
});
