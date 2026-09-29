import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEPLOYMENTS } from './deployments.ts';

const directory = new URL('../../contracts/deployments/', import.meta.url);

describe('DEPLOYMENTS', () => {
  const files = readdirSync(directory).filter((name) => name.endsWith('.json'));

  it('covers every chain the contracts were deployed to', () => {
    assert.deepEqual(
      files.map((name) => Number(name.replace('.json', ''))).sort(),
      Object.keys(DEPLOYMENTS).map(Number).sort(),
    );
  });

  for (const name of files) {
    it(`matches ${name}`, () => {
      const recorded = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
      const known = DEPLOYMENTS[recorded.chainId];
      assert.ok(known);
      for (const field of ['startBlock', 'guardian', 'publisher', 'burnPool', 'rigRegistry', 'pairZap'] as const) {
        assert.equal(String(known[field]).toLowerCase(), String(recorded[field]).toLowerCase(), field);
      }
    });
  }
});
