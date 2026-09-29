import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { CHAINS } from './chain.ts';
import { signedMessage, type Hex } from './protocol.ts';

const DIGEST: Hex = `0x${'ab'.repeat(32)}`;

describe('signedMessage', () => {
  it('lays out the domain, chain, method, path, timestamp, nonce and body digest', () => {
    assert.equal(
      signedMessage(46630, 'post', '/v1/node/hello', 1_790_000_000, 'n0nce-value', DIGEST),
      ['rig-request-v1', '46630', 'POST', '/v1/node/hello', '1790000000', 'n0nce-value', DIGEST].join('\n'),
    );
  });

  it('differs between networks for the same request', () => {
    const message = (chainId: number): string =>
      signedMessage(chainId, 'POST', '/v1/node/heartbeat', 1_790_000_000, 'nonce-1', DIGEST);
    assert.notEqual(message(CHAINS.testnet.id), message(CHAINS.mainnet.id));
  });
});
