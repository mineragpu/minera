import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { COORDINATORS } from '@minera/shared';
import { parseArgs } from './args.ts';

describe('parseArgs', () => {
  it("reads mainnet through the project's coordinator by default", () => {
    assert.deepEqual(parseArgs([]), { network: 'mainnet', coordinator: COORDINATORS.mainnet.url });
  });

  it('switches network and coordinator', () => {
    assert.deepEqual(parseArgs(['--network', 'testnet']), { network: 'testnet', coordinator: COORDINATORS.testnet.url });
    assert.deepEqual(parseArgs(['--coordinator', 'https://own.example/api/']), {
      network: 'mainnet',
      coordinator: 'https://own.example/api',
    });
  });

  it('refuses plain http, credentials, an unknown network and unknown options', () => {
    const refused = [
      ['--coordinator', 'http://own.example'],
      ['--coordinator', 'https://u:p@own.example'],
      ['--network', 'devnet'],
      ['--fast'],
    ];
    for (const argv of refused) {
      const parsed = parseArgs(argv);
      assert.ok('message' in parsed, argv.join(' '));
      assert.equal(parsed.code, 64);
    }
  });
});
