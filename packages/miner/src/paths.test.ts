import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { BRAND } from '@minera/shared';
import { configDirectory, nodePaths } from './paths.ts';
import { readSettings, writeSettings } from './settings.ts';

const name = BRAND.name.toLowerCase();

describe('configDirectory', () => {
  it('uses APPDATA on Windows', () => {
    const directory = configDirectory({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\ada\\AppData\\Roaming' },
      home: 'C:\\Users\\ada',
    });
    assert.equal(directory, `C:\\Users\\ada\\AppData\\Roaming\\${name}`);
  });

  it('falls back to the roaming profile when APPDATA is unset', () => {
    const directory = configDirectory({ platform: 'win32', env: {}, home: 'C:\\Users\\ada' });
    assert.equal(directory, `C:\\Users\\ada\\AppData\\Roaming\\${name}`);
  });

  it('uses an absolute XDG_CONFIG_HOME elsewhere', () => {
    const directory = configDirectory({ platform: 'linux', env: { XDG_CONFIG_HOME: '/srv/cfg' }, home: '/home/ada' });
    assert.equal(directory, `/srv/cfg/${name}`);
  });

  it('ignores a relative XDG_CONFIG_HOME and uses ~/.config', () => {
    for (const env of [{}, { XDG_CONFIG_HOME: 'relative/cfg' }, { XDG_CONFIG_HOME: '' }]) {
      assert.equal(configDirectory({ platform: 'darwin', env, home: '/home/ada' }), `/home/ada/.config/${name}`);
    }
  });

  it('places the key and the settings side by side', () => {
    const paths = nodePaths({ platform: 'linux', env: {}, home: '/home/ada' });
    assert.equal(paths.key, `/home/ada/.config/${name}/node-key.json`);
    assert.equal(paths.settings, `/home/ada/.config/${name}/settings.json`);
  });
});

describe('settings', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rig-settings-'));
  after(() => rmSync(directory, { recursive: true, force: true }));

  it('defaults to testnet with no coordinator when the file is missing', () => {
    assert.deepEqual(readSettings(join(directory, 'missing.json')), { network: 'testnet', coordinators: {} });
  });

  it('round-trips the network and coordinators', () => {
    const path = join(directory, 'nested', 'settings.json');
    writeSettings(path, { network: 'mainnet', coordinators: { testnet: 'https://coordinator.example' } });
    assert.deepEqual(readSettings(path), {
      network: 'mainnet',
      coordinators: { testnet: 'https://coordinator.example' },
    });
  });

  it('rejects a malformed file with a message that names it', () => {
    const path = join(directory, 'broken.json');
    writeFileSync(path, '{"network": ');
    assert.throws(() => readSettings(path), /not valid JSON/);
    writeFileSync(path, '{"network": "moon"}');
    assert.throws(() => readSettings(path), /no valid network/);
  });
});
