import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { COORDINATORS, resolveCoordinator } from './coordinators.ts';

describe('COORDINATORS', () => {
  it('serves each network on its own https address', () => {
    assert.equal(COORDINATORS.mainnet.url, 'https://api.mineragpu.tech');
    assert.equal(COORDINATORS.testnet.url, 'https://testnet-api.mineragpu.tech');
    for (const info of Object.values(COORDINATORS)) assert.match(info.url, /^https:\/\//);
  });

  it('never lists a current address as retired on the same network', () => {
    for (const info of Object.values(COORDINATORS)) assert.ok(!info.retired.includes(info.url));
  });
});

describe('resolveCoordinator', () => {
  it('uses a URL passed on the command line first', () => {
    assert.deepEqual(resolveCoordinator('mainnet', 'https://own.example', 'https://saved.example'), {
      url: 'https://own.example',
      source: 'flag',
    });
  });

  it('keeps a saved URL the project has not retired', () => {
    assert.deepEqual(resolveCoordinator('mainnet', null, 'https://saved.example'), {
      url: 'https://saved.example',
      source: 'saved',
    });
  });

  it("falls back to the project's coordinator when nothing is saved", () => {
    assert.deepEqual(resolveCoordinator('testnet', undefined, undefined), {
      url: 'https://testnet-api.mineragpu.tech',
      source: 'default',
    });
  });

  it('moves a saved URL the project retired, in any case and with a trailing slash', () => {
    assert.deepEqual(resolveCoordinator('mainnet', null, 'https://Coordinator-Mainnet-Production.up.railway.app/'), {
      url: 'https://api.mineragpu.tech',
      source: 'moved',
    });
  });

  it('moves a testnet node off the address that now serves mainnet', () => {
    assert.deepEqual(resolveCoordinator('testnet', null, 'https://api.mineragpu.tech'), {
      url: 'https://testnet-api.mineragpu.tech',
      source: 'moved',
    });
  });

  it('leaves a mainnet node on its current address', () => {
    assert.equal(resolveCoordinator('mainnet', null, 'https://api.mineragpu.tech').source, 'saved');
  });
});
