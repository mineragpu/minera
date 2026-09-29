import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CHAINS, DEPLOYMENTS, type Address, type Hex } from '@dayagpu/shared';
import { concat, getAddress, keccak256, recoverAddress, recoverMessageAddress, stringToHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createDeployCode, deployDigest, deployTargetFor } from './deploy-code.ts';

const word = (hex: string): string => hex.replace(/^0x/, '').padStart(64, '0');

/** `abi.encode("rig-deploy-v1", chainid, registry, operator)`, laid out by hand. */
function contractDigest(chainId: number, registry: Address, operator: Address): Hex {
  const domain = Buffer.from('rig-deploy-v1', 'utf8').toString('hex');
  const encoded =
    word('80') +
    word(chainId.toString(16)) +
    word(registry.toLowerCase()) +
    word(operator.toLowerCase()) +
    word((domain.length / 2).toString(16)) +
    domain.padEnd(64, '0');
  return keccak256(`0x${encoded}`);
}

/** `MessageHashUtils.toEthSignedMessageHash(bytes32)`. */
function ethSignedMessageHash(digest: Hex): Hex {
  return keccak256(concat([stringToHex('\x19Ethereum Signed Message:\n32'), digest]));
}

describe('deployDigest', () => {
  it('matches the contract encoding', () => {
    const registry: Address = '0xa9f0BaB0AE7cc4A7B605D831d57A3A2a0E7921D8';
    const operator: Address = getAddress('0x000000000000000000000000000000000000ca01');
    assert.equal(deployDigest(46630, registry, operator), contractDigest(46630, registry, operator));
    assert.equal(deployDigest(4663, registry, operator), contractDigest(4663, registry, operator));
  });

  it('binds the chain, the registry and the operator', () => {
    const registry: Address = '0x00000000000000000000000000000000000000aa';
    const operator: Address = '0x00000000000000000000000000000000000000bb';
    const base = deployDigest(1, registry, operator);
    assert.notEqual(deployDigest(2, registry, operator), base);
    assert.notEqual(deployDigest(1, operator, operator), base);
    assert.notEqual(deployDigest(1, registry, registry), base);
  });
});

describe('createDeployCode', () => {
  it('recovers to the node address the way the registry recovers it', async () => {
    const node = privateKeyToAccount(generatePrivateKey());
    const operator = privateKeyToAccount(generatePrivateKey()).address;
    const target = deployTargetFor('testnet');
    assert.ok(target);

    const code = await createDeployCode(node, target, operator);
    assert.match(code, /^0x[0-9a-f]{130}$/);

    const digest = contractDigest(target.chainId, target.registry, operator);
    assert.equal(await recoverAddress({ hash: ethSignedMessageHash(digest), signature: code }), node.address);
    assert.equal(await recoverMessageAddress({ message: { raw: digest }, signature: code }), node.address);

    const otherOperator = privateKeyToAccount(generatePrivateKey()).address;
    const wrongDigest = contractDigest(target.chainId, target.registry, otherOperator);
    assert.notEqual(await recoverAddress({ hash: ethSignedMessageHash(wrongDigest), signature: code }), node.address);
  });

  it('targets the registry recorded in the shared deployments', () => {
    const target = deployTargetFor('testnet');
    assert.ok(target);
    assert.equal(target.chainId, 46630);
    assert.equal(target.registry, DEPLOYMENTS[46630]?.rigRegistry);
  });

  it('has no target on a network without a deployment', () => {
    assert.equal(deployTargetFor('mainnet') === null, DEPLOYMENTS[CHAINS.mainnet.id] === undefined);
  });
});

describe('the contract fixture', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('../../contracts/test/fixtures/deploy-code.json', import.meta.url), 'utf8'),
  ) as { chainId: number; registry: Address; operator: Address; nodeKey: Address; digest: Hex; deployCode: Hex };

  it('holds a digest computed like the contract', () => {
    assert.equal(fixture.digest, contractDigest(fixture.chainId, fixture.registry, fixture.operator));
    assert.equal(fixture.digest, deployDigest(fixture.chainId, fixture.registry, fixture.operator));
  });

  it('holds a deploy code that recovers to its node key', async () => {
    const hash = ethSignedMessageHash(fixture.digest);
    assert.equal(await recoverAddress({ hash, signature: fixture.deployCode }), fixture.nodeKey);
  });
});
