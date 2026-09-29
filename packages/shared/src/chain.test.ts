import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { CHAINS, DEFAULT_NETWORK, addChainParameter, isNetworkKey } from './chain.ts';

describe('CHAINS', () => {
  for (const chain of Object.values(CHAINS)) {
    it(`keeps the hex id of ${chain.network} in step with its number`, () => {
      assert.equal(chain.hexId, `0x${chain.id.toString(16)}`);
      assert.equal(Number.parseInt(chain.hexId, 16), chain.id);
    });

    it(`serves ${chain.network} over https only`, () => {
      for (const url of [...chain.rpcUrls, chain.explorerUrl]) {
        assert.equal(new URL(url).protocol, 'https:');
      }
    });
  }

  it('starts on testnet', () => {
    assert.equal(DEFAULT_NETWORK, 'testnet');
    assert.equal(CHAINS[DEFAULT_NETWORK].id, 46630);
  });
});

describe('addChainParameter', () => {
  it('carries every endpoint, in order, as a fresh array', () => {
    const chain = CHAINS.testnet;
    const parameter = addChainParameter(chain);
    assert.deepEqual(parameter.rpcUrls, chain.rpcUrls);
    assert.notEqual(parameter.rpcUrls, chain.rpcUrls);
    assert.deepEqual(parameter.blockExplorerUrls, [chain.explorerUrl]);
    assert.equal(parameter.chainId, '0xb626');
    assert.equal(parameter.nativeCurrency.decimals, 18);
  });
});

describe('isNetworkKey', () => {
  it('accepts only the two known networks', () => {
    assert.ok(isNetworkKey('testnet'));
    assert.ok(isNetworkKey('mainnet'));
    assert.ok(!isNetworkKey('Testnet'));
    assert.ok(!isNetworkKey(undefined));
  });
});
