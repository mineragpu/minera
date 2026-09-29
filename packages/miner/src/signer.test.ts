import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { NODE_HEADERS, NODE_ROUTES, signedMessage, type Hex } from '@dayagpu/shared';
import { keccak256, recoverMessageAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { bodyDigest, newNonce, signRequest } from './signer.ts';

const account = privateKeyToAccount(generatePrivateKey());
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('signRequest', () => {
  it('produces headers whose signature recovers to the node key', async () => {
    const body = encode(JSON.stringify({ load: { busy: false, queue: 0 } }));
    const headers = await signRequest(
      account,
      { method: 'post', path: NODE_ROUTES.heartbeat, body },
      { timestamp: 1_790_000_000, nonce: '00112233445566778899aabbccddeeff' },
    );

    assert.equal(headers[NODE_HEADERS.key], account.address);
    assert.equal(headers[NODE_HEADERS.timestamp], '1790000000');
    assert.equal(headers[NODE_HEADERS.nonce], '00112233445566778899aabbccddeeff');

    const nonce = headers[NODE_HEADERS.nonce];
    const message = signedMessage('POST', NODE_ROUTES.heartbeat, 1_790_000_000, nonce, keccak256(body));
    const signer = await recoverMessageAddress({ message, signature: headers[NODE_HEADERS.signature] as Hex });
    assert.equal(signer, account.address);
  });

  it('commits to the body, the path and the method', async () => {
    const body = encode('{"output":"a"}');
    const options = { timestamp: 1_790_000_000, nonce: 'aa'.repeat(16) };
    const headers = await signRequest(account, { method: 'POST', path: '/v1/node/jobs/j1/result', body }, options);
    const signature = headers[NODE_HEADERS.signature] as Hex;
    const recover = (method: string, path: string, digest: Hex) =>
      recoverMessageAddress({
        message: signedMessage(method, path, options.timestamp, options.nonce, digest),
        signature,
      });

    assert.equal(await recover('POST', '/v1/node/jobs/j1/result', keccak256(body)), account.address);
    const otherBody = keccak256(encode('{"output":"b"}'));
    assert.notEqual(await recover('POST', '/v1/node/jobs/j1/result', otherBody), account.address);
    assert.notEqual(await recover('POST', '/v1/node/jobs/j2/result', keccak256(body)), account.address);
    assert.notEqual(await recover('GET', '/v1/node/jobs/j1/result', keccak256(body)), account.address);
  });

  it('uses the current unix time and a fresh nonce by default', async () => {
    const before = Math.floor(Date.now() / 1000);
    const first = await signRequest(account, { method: 'POST', path: NODE_ROUTES.hello, body: new Uint8Array() });
    const second = await signRequest(account, { method: 'POST', path: NODE_ROUTES.hello, body: new Uint8Array() });
    const timestamp = Number(first[NODE_HEADERS.timestamp]);
    assert.ok(timestamp >= before && timestamp <= before + 2);
    assert.match(first[NODE_HEADERS.nonce], /^[0-9a-f]{32}$/);
    assert.notEqual(first[NODE_HEADERS.nonce], second[NODE_HEADERS.nonce]);
  });
});

describe('bodyDigest', () => {
  it('hashes empty bytes for a request without a body', () => {
    assert.equal(bodyDigest(new Uint8Array()), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });

  it('hashes the raw UTF-8 bytes', () => {
    assert.equal(bodyDigest(encode('héllo')), keccak256(Buffer.from('héllo', 'utf8')));
  });
});

describe('newNonce', () => {
  it('is 16 random bytes in hex', () => {
    assert.match(newNonce(), /^[0-9a-f]{32}$/);
  });
});
