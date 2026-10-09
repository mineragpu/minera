import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { endpoint } from './client.ts';

describe('endpoint', () => {
  it('leaves a URL without credentials as it is', () => {
    assert.deepEqual(endpoint('https://rpc.example/v2/key'), { url: 'https://rpc.example/v2/key' });
  });

  it('moves user and password into a basic auth header', () => {
    const { url, authorization } = endpoint('https://node-user:p%40ss@rpc.example/');
    assert.equal(url, 'https://rpc.example/');
    assert.equal(authorization, `Basic ${Buffer.from('node-user:p@ss').toString('base64')}`);
    assert.ok(!url.includes('p%40ss') && !url.includes('node-user'));
  });
});
