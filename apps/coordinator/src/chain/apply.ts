import type { Store } from '../store/store.ts';
import type { ChainEvent } from './events.ts';

/** Apply a range of events and advance the cursor in one transaction, so a crash never skips logs. */
export async function applyChainEvents(store: Store, events: readonly ChainEvent[], cursor: bigint): Promise<void> {
  await store.transaction(async (tx) => {
    for (const event of events) {
      switch (event.type) {
        case 'rigDeployed':
          await tx.rigs.deploy({
            nodeKey: event.nodeKey,
            operator: event.operator,
            pair: event.pair,
            name: event.name,
            deployedAt: event.blockTime,
            deployedBlock: event.blockNumber,
          });
          break;
        case 'pairChanged':
          await tx.rigs.setPair(event.nodeKey, event.pair);
          break;
        case 'rigRetired':
          await tx.rigs.retire(event.nodeKey, event.blockTime);
          break;
        case 'burned':
          await tx.chain.addBurn({
            blockNumber: event.blockNumber,
            blockTime: event.blockTime,
            txHash: event.txHash,
            logIndex: event.logIndex,
            from: event.from,
            amount: event.amount,
            campaignId: event.campaignId,
            memo: event.memo,
          });
          break;
        case 'settlementPublished':
          await tx.settlements.recordPublished({
            index: event.index,
            root: event.root,
            total: event.total,
            inputsDigest: event.inputs,
            txHash: event.txHash,
            blockNumber: event.blockNumber,
            publishedAt: event.blockTime,
            claimableAt: event.claimableAt,
          });
          break;
        case 'settlementVetoed':
          await tx.settlements.markVetoed(event.index);
          break;
        case 'claimed':
          await tx.chain.addClaim({
            blockNumber: event.blockNumber,
            blockTime: event.blockTime,
            txHash: event.txHash,
            logIndex: event.logIndex,
            account: event.account,
            index: event.index,
            amount: event.amount,
            via: event.via,
          });
          break;
      }
    }
    await tx.chain.setCursor(cursor);
  });
}
