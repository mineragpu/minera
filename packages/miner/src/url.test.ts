import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { checkServiceUrl, endpoint } from './url.ts';

describe('checkServiceUrl', () => {
  it('normalizes an https URL', () => {
    assert.deepEqual(checkServiceUrl('https://coord.example/api/?x=1#y', true), {
      ok: true,
      url: 'https://coord.example/api',
    });
  });

  it('allows plain http only for this machine when TLS is required', () => {
    for (const host of ['localhost:8787', '127.0.0.1:8787', '[::1]:8787']) {
      assert.equal(checkServiceUrl(`http://${host}`, true).ok, true, host);
    }
    assert.deepEqual(checkServiceUrl('http://coord.example', true), {
      ok: false,
      problem: 'must use https. Plain http is allowed only for this machine',
    });
    assert.equal(checkServiceUrl('http://10.0.0.5:11434', false).ok, true);
  });

  it('rejects credentials, other schemes and text that is not a URL', () => {
    assert.equal(checkServiceUrl('https://user:secret@coord.example', true).ok, false);
    assert.equal(checkServiceUrl('file:///tmp/socket', false).ok, false);
    assert.equal(checkServiceUrl('coord.example', true).ok, false);
  });
});

describe('endpoint', () => {
  it('keeps a path prefix and drops the query', () => {
    assert.equal(endpoint('http://127.0.0.1:11434', '/api/chat').href, 'http://127.0.0.1:11434/api/chat');
    assert.equal(endpoint('https://host/prefix/?a=1#x', '/v1/node/hello').href, 'https://host/prefix/v1/node/hello');
  });
});
