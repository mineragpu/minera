/**
 * Writes a settlement built by the coordinator's code to a fixture the contract tests read, so
 * the Solidity suite proves that proofs produced here verify on-chain.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSettlement } from '../src/merkle.ts';
import type { Address } from '../src/rewards.ts';

const ETH = 10n ** 18n;
const entitlements = new Map<Address, bigint>([
  ['0x00000000000000000000000000000000000a11ce', 750n * 10n ** 15n],
  ['0x0000000000000000000000000000000000000b0b', 250n * 10n ** 15n],
  ['0x000000000000000000000000000000000000ca01', 1n * ETH],
]);

const settlement = buildSettlement(entitlements);
const entries = [...settlement.proofs].map(([account, { cumulative, proof }]) => ({
  account,
  cumulative: cumulative.toString(),
  proof,
}));

const target = fileURLToPath(new URL('../../contracts/test/fixtures/settlement.json', import.meta.url));
writeFileSync(
  target,
  `${JSON.stringify({ root: settlement.root, total: settlement.total.toString(), count: entries.length, entries }, null, 2)}\n`,
);
