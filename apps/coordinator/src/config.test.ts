import { strict as assert } from 'node:assert';
import { inspect } from 'node:util';
import { describe, it } from 'node:test';
import { CHAINS } from '@minera/shared';
import { ConfigError, configSummary, loadConfig } from './config.ts';

const DATABASE_URL = 'postgres://coordinator:hunter2@localhost:5432/coordinator';
const KEY = `0x${'ab'.repeat(32)}`;

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    const config = loadConfig({ DATABASE_URL });
    assert.equal(config.port, 8080);
    assert.equal(config.network, 'testnet');
    assert.equal(config.chain.id, 46630);
    assert.deepEqual(config.rpcUrls, CHAINS.testnet.rpcUrls);
    assert.equal(config.publisherKey, null);
    assert.deepEqual(config.corsOrigins, []);
    assert.equal(config.epochSeconds, 3_600);
    assert.equal(config.heartbeatSeconds, 30);
    assert.equal(config.redundancyRate, 0.2);
    assert.deepEqual(config.playground, { model: 'llama3.2:1b', maxTokens: 256 });
  });

  it('reads comma lists and treats empty values as unset', () => {
    const config = loadConfig({
      DATABASE_URL,
      RPC_URL: 'https://a.example, https://b.example',
      CORS_ORIGINS: 'https://site.example,,http://localhost:5173',
      PORT: '',
    });
    assert.deepEqual(config.rpcUrls, ['https://a.example', 'https://b.example']);
    assert.deepEqual(config.corsOrigins, ['https://site.example', 'http://localhost:5173']);
    assert.equal(config.port, 8080);
  });

  it('rejects out-of-range values and names the variable', () => {
    assert.throws(() => loadConfig({ DATABASE_URL, REDUNDANCY_RATE: '1.5' }), /REDUNDANCY_RATE/);
    assert.throws(() => loadConfig({ DATABASE_URL, NETWORK: 'devnet' }), /NETWORK/);
    assert.throws(() => loadConfig({ DATABASE_URL, RPC_URL: 'ftp://node.example' }), ConfigError);
    assert.throws(() => loadConfig({}), /DATABASE_URL/);
  });

  it('loads each network with its own recorded deployment', () => {
    for (const network of ['testnet', 'mainnet'] as const) {
      const config = loadConfig({ DATABASE_URL, NETWORK: network });
      assert.equal(config.chain.network, network);
      assert.equal(config.deployment.chainId, config.chain.id);
    }
  });

  it('never prints a secret, even in a validation error', () => {
    const config = loadConfig({ DATABASE_URL, PUBLISHER_PRIVATE_KEY: KEY });
    assert.equal(config.publisherKey?.reveal(), KEY);
    for (const text of [JSON.stringify(config), inspect(config), JSON.stringify(configSummary(config))]) {
      assert.ok(!text.includes(KEY.slice(2)));
      assert.ok(!text.includes('hunter2'));
    }
    assert.throws(
      () => loadConfig({ DATABASE_URL, PUBLISHER_PRIVATE_KEY: 'not-a-key-hunter2' }),
      (error: Error) => error.message.includes('PUBLISHER_PRIVATE_KEY') && !error.message.includes('hunter2'),
    );
  });
});
