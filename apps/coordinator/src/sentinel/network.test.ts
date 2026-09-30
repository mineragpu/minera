import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { networkKey, subnetOf } from './network.ts';

describe('subnetOf', () => {
  it('groups IPv4 addresses by /24', () => {
    assert.equal(subnetOf('203.0.113.7'), '4:203.0.113');
    assert.equal(subnetOf('203.0.113.200'), subnetOf('203.0.113.7'));
    assert.notEqual(subnetOf('203.0.114.7'), subnetOf('203.0.113.7'));
  });

  it('reads IPv4 mapped into IPv6 as IPv4', () => {
    assert.equal(subnetOf('::ffff:203.0.113.7'), '4:203.0.113');
  });

  it('groups IPv6 addresses by /48, whatever the notation', () => {
    assert.equal(subnetOf('2001:db8:aa::1'), '6:2001:db8:aa');
    assert.equal(subnetOf('2001:0db8:00aa:0001:0000:0000:0000:0001'), '6:2001:db8:aa');
    assert.equal(subnetOf('2001:db8:aa:ffff::'), '6:2001:db8:aa');
    assert.equal(subnetOf('::1'), '6:0:0:0');
    assert.equal(subnetOf('64:ff9b::192.0.2.33'), '6:64:ff9b:0');
    assert.equal(subnetOf('0:0:0:0:0:fffe:192.0.2.33'), '6:0:0:0');
    assert.equal(subnetOf('fe80::1%eth0'), '6:fe80:0:0');
  });

  it('has no subnet for text that is not an address', () => {
    for (const value of ['', 'localhost', '203.0.113', '1.2.3.4.5', 'gg::1']) assert.equal(subnetOf(value), null, value);
  });
});

describe('networkKey', () => {
  it('is stable per subnet and salt, and never the address itself', () => {
    const key = networkKey('203.0.113.7', 'salt-one-0123456789');
    assert.ok(key);
    assert.match(key, /^[0-9a-f]{24}$/);
    assert.equal(networkKey('203.0.113.99', 'salt-one-0123456789'), key);
    assert.notEqual(networkKey('203.0.113.7', 'salt-two-0123456789'), key);
    assert.equal(key.includes('203'), false);
  });

  it('is null without a subnet', () => {
    assert.equal(networkKey('not an address', 'salt-one-0123456789'), null);
  });
});
