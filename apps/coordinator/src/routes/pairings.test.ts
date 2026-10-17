import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { PAIRING_ROUTES, PAIRING_TTL_SECONDS, type Address, type Hex } from '@minera/shared';
import { deployDigest } from '../chain/deployCode.ts';
import { createTestApp, type TestApp } from '../testing/testApp.ts';

const NODE = privateKeyToAccount(`0x${'42'.repeat(32)}`);
const OTHER_NODE = privateKeyToAccount(`0x${'43'.repeat(32)}`);
const OPERATOR = '0x00000000000000000000000000000000000000aa' as Address;
const CODE = '0123456789abcdef0123456789abcdef';

let harness: TestApp;

async function deployCode(node: typeof NODE, operator: Address = OPERATOR, chainId = harness.config.chain.id): Promise<Hex> {
  return node.signMessage({ message: { raw: deployDigest(chainId, harness.config.deployment.rigRegistry, operator) } });
}

async function body(overrides: Record<string, unknown> = {}) {
  return {
    code: CODE,
    nodeAddress: NODE.address,
    operator: OPERATOR,
    deployCode: await deployCode(NODE),
    gpu: { model: 'Example GPU 8GB', vramMb: 8192 },
    clientVersion: '1.2.0',
    ...overrides,
  };
}

const pair = (payload: unknown) => harness.app.inject({ method: 'POST', url: PAIRING_ROUTES.create, payload: payload as object });
const read = (code: string) => harness.app.inject({ method: 'GET', url: PAIRING_ROUTES.view(code) });

beforeEach(async () => {
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.app.close();
});

describe('pairings', () => {
  it('hands a machine to the Deploy page under its code', async () => {
    assert.equal((await read(CODE)).statusCode, 404);
    const created = await pair(await body());
    assert.equal(created.statusCode, 201);
    const pairing = (await read(CODE)).json();
    assert.equal(pairing.nodeAddress, NODE.address.toLowerCase());
    assert.equal(pairing.operator, OPERATOR);
    assert.equal(pairing.deployCode, (await deployCode(NODE)).toLowerCase());
    assert.deepEqual(pairing.gpu, { model: 'Example GPU 8GB', vramMb: 8192 });
    assert.equal(pairing.clientVersion, '1.2.0');
    assert.equal(pairing.pairedAt, harness.clock.now.toISOString());
    assert.equal(
      new Date(pairing.expiresAt).getTime() - harness.clock.now.getTime(),
      PAIRING_TTL_SECONDS * 1000,
    );
  });

  it('lets the same machine pair again, but not another one', async () => {
    assert.equal((await pair(await body())).statusCode, 201);
    assert.equal((await pair(await body({ gpu: null }))).statusCode, 201);
    assert.equal((await read(CODE)).json().gpu, null);
    const other = await pair(await body({ nodeAddress: OTHER_NODE.address, deployCode: await deployCode(OTHER_NODE) }));
    assert.equal(other.statusCode, 409);
    assert.equal(other.json().error.code, 'pairing_taken');
    assert.equal((await read(CODE)).json().nodeAddress, NODE.address.toLowerCase());
  });

  it('refuses a deploy code made by another node, for another wallet or on another chain', async () => {
    const cases = [
      { deployCode: await deployCode(OTHER_NODE) },
      { deployCode: await deployCode(NODE, '0x00000000000000000000000000000000000000bb') },
      { deployCode: await deployCode(NODE, OPERATOR, harness.config.chain.id + 1) },
      { deployCode: `0x${'00'.repeat(65)}` },
    ];
    for (const overrides of cases) {
      const response = await pair(await body(overrides));
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, 'deploy_code_mismatch');
    }
    assert.equal((await read(CODE)).statusCode, 404);
  });

  it('validates every field', async () => {
    const cases: Record<string, unknown>[] = [
      { code: 'ABCDEF0123456789abcdef0123456789' },
      { code: 'short' },
      { nodeAddress: '0x1234' },
      { deployCode: '0x1234' },
      { gpu: { model: '', vramMb: 1 } },
      { gpu: { model: 'GPU\n', vramMb: 1 } },
      { gpu: { model: 'GPU', vramMb: -1 } },
      { clientVersion: 'latest' },
      { extra: true },
    ];
    for (const overrides of cases) {
      const response = await pair(await body(overrides));
      assert.equal(response.statusCode, 400, JSON.stringify(overrides));
      assert.equal(response.json().error.code, 'invalid_request');
    }
    assert.equal((await read('not-a-code')).statusCode, 400);
  });

  it('forgets a pairing once it expires', async () => {
    await pair(await body());
    harness.clock.now = new Date(harness.clock.now.getTime() + PAIRING_TTL_SECONDS * 1000);
    assert.equal((await read(CODE)).statusCode, 404);
  });
});
