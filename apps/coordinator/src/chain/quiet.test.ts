import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DEPLOYMENTS } from '@minera/shared';
import { deploymentIsQuiet, type QuietReader } from './quiet.ts';

const deployment = DEPLOYMENTS[46630]!;

function reader(values: Record<string, bigint>): QuietReader {
  return {
    readContract: async ({ functionName }: { functionName: string }) => values[functionName] ?? 0n,
  } as unknown as QuietReader;
}

describe('deploymentIsQuiet', () => {
  it('holds when no rig, burn, settlement or claim was ever recorded', async () => {
    assert.equal(await deploymentIsQuiet(reader({}), deployment), true);
  });

  for (const counter of ['rigCount', 'totalBurned', 'settlementCount', 'totalClaimed']) {
    it(`fails once ${counter} is above zero`, async () => {
      assert.equal(await deploymentIsQuiet(reader({ [counter]: 1n }), deployment), false);
    });
  }
});
