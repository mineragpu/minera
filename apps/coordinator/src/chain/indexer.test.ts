import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseEventLogs, type Log } from 'viem';
import { DEPLOYMENTS, type Address, type Hex } from '@dayagpu/shared';
import { createMemoryStore } from '../store/memory/index.ts';
import { encodeLog } from '../testing/encodeLog.ts';
import { indexedEvents } from './abi.ts';
import { indexNextRange, type ChainReader } from './indexer.ts';

const deployment = DEPLOYMENTS[46630]!;
const START = BigInt(deployment.startBlock);
const NODE = '0x00000000000000000000000000000000000000a1' as Address;
const OPERATOR = '0x00000000000000000000000000000000000000b2' as Address;
const STOCK = '0x00000000000000000000000000000000000000c3' as Address;
const IMPOSTOR = '0x00000000000000000000000000000000000000d4' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const hex32 = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

function fakeChain(head: bigint, logs: Log[]): ChainReader & { requests: [bigint, bigint][] } {
  const decoded = parseEventLogs({ abi: indexedEvents, logs, strict: true });
  const requests: [bigint, bigint][] = [];
  const reader = {
    requests,
    getBlockNumber: async () => head,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      number: blockNumber,
      timestamp: 1_790_000_000n + blockNumber - START,
    }),
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      requests.push([fromBlock, toBlock]);
      return decoded.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock);
    },
  };
  return reader as unknown as ChainReader & { requests: [bigint, bigint][] };
}

describe('indexNextRange', () => {
  it('reads bounded ranges from the start block and applies registry and pool events', async () => {
    const store = createMemoryStore();
    const chain = fakeChain(START + 25n, [
      encodeLog(
        deployment.rigRegistry,
        'RigDeployed',
        { nodeKey: NODE, operator: OPERATOR, pair: ZERO, name: 'basement' },
        START + 2n,
        0,
      ),
      encodeLog(
        IMPOSTOR,
        'RigDeployed',
        { nodeKey: IMPOSTOR, operator: IMPOSTOR, pair: IMPOSTOR, name: 'fake' },
        START + 3n,
        0,
      ),
      encodeLog(deployment.rigRegistry, 'PairChanged', { nodeKey: NODE, pair: STOCK }, START + 12n, 1),
      encodeLog(
        deployment.burnPool,
        'Burned',
        { from: OPERATOR, amount: 5n * 10n ** 17n, campaignId: 1n, memo: hex32(0) },
        START + 12n,
        2,
      ),
      encodeLog(
        deployment.burnPool,
        'SettlementPublished',
        { index: 1n, root: hex32(7), total: 10n, claimableAt: 1_790_001_800n, inputs: hex32(8) },
        START + 20n,
        0,
      ),
      encodeLog(
        deployment.burnPool,
        'Claimed',
        { account: OPERATOR, index: 1n, amount: 4n, via: ZERO },
        START + 25n,
        0,
      ),
    ]);

    const first = await indexNextRange({ client: chain, store, deployment, range: 10n });
    assert.deepEqual(first, { from: START, to: START + 9n, events: 1, caughtUp: false });
    const rig = await store.rigs.get(NODE);
    assert.deepEqual([rig?.operator, rig?.name, rig?.deployedBlock], [OPERATOR, 'basement', START + 2n]);
    assert.deepEqual(rig?.deployedAt, new Date((1_790_000_000 + 2) * 1000));
    assert.equal(await store.rigs.get(IMPOSTOR), null);

    await indexNextRange({ client: chain, store, deployment, range: 10n });
    const last = await indexNextRange({ client: chain, store, deployment, range: 10n });
    assert.deepEqual(last, { from: START + 20n, to: START + 25n, events: 2, caughtUp: true });
    assert.deepEqual(chain.requests, [[START, START + 9n], [START + 10n, START + 19n], [START + 20n, START + 25n]]);

    assert.equal((await store.rigs.get(NODE))?.pair, STOCK);
    const burns = await store.chain.recentBurns(5);
    assert.deepEqual(burns.map((burn) => [burn.amount, burn.campaignId]), [[5n * 10n ** 17n, 1n]]);
    const settlement = await store.settlements.byIndex(1);
    assert.deepEqual([settlement?.root, settlement?.total, settlement?.blockNumber], [hex32(7), 10n, START + 20n]);
    assert.deepEqual(settlement?.claimableAt, new Date(1_790_001_800_000));
    assert.equal(await store.chain.claimedBy(OPERATOR), 4n);
    assert.equal(await store.chain.cursor(), START + 25n);
    assert.equal(await indexNextRange({ client: chain, store, deployment, range: 10n }), null);
  });
});
