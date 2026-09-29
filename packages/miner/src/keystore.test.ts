import { strict as assert } from 'node:assert';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { KeyExistsError, createNodeKey, isKeyFileShared, loadNodeKey } from './keystore.ts';

const posix = process.platform !== 'win32';

describe('keystore', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rig-keystore-'));
  after(() => rmSync(directory, { recursive: true, force: true }));

  it('creates a key that loads back to the same address', () => {
    const path = join(directory, 'a', 'node-key.json');
    const created = createNodeKey(path, { force: false });
    const loaded = loadNodeKey(path);
    assert.ok(loaded);
    assert.equal(loaded.address, created.address);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).address, created.address);
  });

  it('does not expose the private key on the returned account', () => {
    const path = join(directory, 'b', 'node-key.json');
    const key = createNodeKey(path, { force: false });
    const stored: string = JSON.parse(readFileSync(path, 'utf8')).privateKey;
    assert.ok(!JSON.stringify(key).includes(stored.slice(2)));
    assert.ok(!Object.values(key.account).some((value) => value === stored));
  });

  it('refuses to overwrite an existing key unless forced', () => {
    const path = join(directory, 'c', 'node-key.json');
    const first = createNodeKey(path, { force: false });
    assert.throws(() => createNodeKey(path, { force: false }), KeyExistsError);
    assert.equal(loadNodeKey(path)?.address, first.address);
    const second = createNodeKey(path, { force: true });
    assert.notEqual(second.address, first.address);
    assert.equal(loadNodeKey(path)?.address, second.address);
  });

  it('writes the key readable by its owner only', { skip: !posix && 'POSIX modes only' }, () => {
    const path = join(directory, 'd', 'node-key.json');
    createNodeKey(path, { force: false });
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(isKeyFileShared(path, process.platform), false);
    chmodSync(path, 0o644);
    assert.equal(isKeyFileShared(path, process.platform), true);
  });

  it('returns null when there is no key yet', () => {
    assert.equal(loadNodeKey(join(directory, 'none', 'node-key.json')), null);
  });

  it('rejects damaged key files without quoting their contents', () => {
    const path = join(directory, 'broken.json');
    const secret = `0x${'ab'.repeat(32)}`;
    writeFileSync(path, `{"privateKey": "${secret}",`);
    assert.throws(
      () => loadNodeKey(path),
      (error: Error) => /not valid JSON/.test(error.message) && !error.message.includes(secret.slice(2, 20)),
    );
    writeFileSync(path, JSON.stringify({ privateKey: secret, address: '0x0000000000000000000000000000000000000001' }));
    assert.throws(() => loadNodeKey(path), /does not match/);
    writeFileSync(path, JSON.stringify({ privateKey: '0x1234', address: '0x0000000000000000000000000000000000000001' }));
    assert.throws(() => loadNodeKey(path), /valid private key/);
  });
});
