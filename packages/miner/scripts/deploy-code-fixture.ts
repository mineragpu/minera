/**
 * Writes a deploy code produced by the node client to a fixture the contract tests read, so the
 * Solidity suite proves that `RigRegistry.deploy` accepts what `rig init` prints.
 *
 * The key is a fixed test value, the same one the registry's own tests use. It guards nothing.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { createDeployCode, deployDigest, deployTargetFor } from '../src/deploy-code.ts';

const TEST_NODE_KEY = `0x${'a11ce'.padStart(64, '0')}` as const;
const OPERATOR = '0x000000000000000000000000000000000000ca01';

const target = deployTargetFor('testnet');
if (!target) throw new Error('The testnet registry is missing from the shared deployments.');

const node = privateKeyToAccount(TEST_NODE_KEY);
const fixture = {
  chainId: target.chainId,
  registry: target.registry,
  operator: OPERATOR,
  nodeKey: node.address,
  digest: deployDigest(target.chainId, target.registry, OPERATOR),
  deployCode: await createDeployCode(node, target, OPERATOR),
};

const path = fileURLToPath(new URL('../../contracts/test/fixtures/deploy-code.json', import.meta.url));
writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
