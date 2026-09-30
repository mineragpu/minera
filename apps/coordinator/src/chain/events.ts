import type { Log } from 'viem';
import type { Address, Hex } from '@minera/shared';
import type { LogPosition } from '../store/records.ts';
import type { indexedEvents } from './abi.ts';

export type IndexedLog = Log<bigint, number, false, undefined, true, typeof indexedEvents>;

export type ChainEvent = LogPosition &
  (
    | { type: 'rigDeployed'; nodeKey: Address; operator: Address; pair: Address; name: string }
    | { type: 'pairChanged'; nodeKey: Address; pair: Address }
    | { type: 'rigRetired'; nodeKey: Address }
    | { type: 'burned'; from: Address; amount: bigint; campaignId: bigint; memo: Hex }
    | { type: 'settlementPublished'; index: number; root: Hex; total: bigint; claimableAt: Date; inputs: Hex }
    | { type: 'settlementVetoed'; index: number }
    | { type: 'claimed'; account: Address; index: number; amount: bigint; via: Address }
  );

export interface EventSources {
  rigRegistry: Address;
  burnPool: Address;
}

function lower(address: Address): Address {
  return address.toLowerCase() as Address;
}

function settlementIndex(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`settlement index ${value} is out of range`);
  return Number(value);
}

/**
 * Turn a decoded log into an event the store understands. A log from an address other than the
 * contract that defines the event is ignored, so a look-alike event elsewhere cannot inject rigs
 * or settlements.
 */
export function toChainEvent(log: IndexedLog, blockTime: Date, sources: EventSources): ChainEvent | null {
  const position: LogPosition = {
    blockNumber: log.blockNumber,
    blockTime,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
  };
  const emitter = lower(log.address);
  const fromRegistry = emitter === lower(sources.rigRegistry);
  const fromPool = emitter === lower(sources.burnPool);

  switch (log.eventName) {
    case 'RigDeployed':
      if (!fromRegistry) return null;
      return {
        ...position,
        type: 'rigDeployed',
        nodeKey: lower(log.args.nodeKey),
        operator: lower(log.args.operator),
        pair: lower(log.args.pair),
        name: log.args.name,
      };
    case 'PairChanged':
      if (!fromRegistry) return null;
      return { ...position, type: 'pairChanged', nodeKey: lower(log.args.nodeKey), pair: lower(log.args.pair) };
    case 'RigRetired':
      if (!fromRegistry) return null;
      return { ...position, type: 'rigRetired', nodeKey: lower(log.args.nodeKey) };
    case 'Burned':
      if (!fromPool) return null;
      return {
        ...position,
        type: 'burned',
        from: lower(log.args.from),
        amount: log.args.amount,
        campaignId: log.args.campaignId,
        memo: log.args.memo,
      };
    case 'SettlementPublished':
      if (!fromPool) return null;
      return {
        ...position,
        type: 'settlementPublished',
        index: settlementIndex(log.args.index),
        root: log.args.root,
        total: log.args.total,
        claimableAt: new Date(Number(log.args.claimableAt) * 1000),
        inputs: log.args.inputs,
      };
    case 'SettlementVetoed':
      if (!fromPool) return null;
      return { ...position, type: 'settlementVetoed', index: settlementIndex(log.args.index) };
    case 'Claimed':
      if (!fromPool) return null;
      return {
        ...position,
        type: 'claimed',
        account: lower(log.args.account),
        index: settlementIndex(log.args.index),
        amount: log.args.amount,
        via: lower(log.args.via),
      };
  }
}
