/** Only the contract fragments the coordinator reads or sends, mirrored from the Solidity sources. */

import { parseAbi } from 'viem';

const RIG_REGISTRY_EVENTS = [
  'event RigDeployed(address indexed nodeKey, address indexed operator, address indexed pair, string name)',
  'event PairChanged(address indexed nodeKey, address indexed pair)',
  'event RigRetired(address indexed nodeKey)',
] as const;

const BURN_POOL_EVENTS = [
  'event Burned(address indexed from, uint256 amount, uint256 indexed campaignId, bytes32 memo)',
  'event SettlementPublished(uint256 indexed index, bytes32 root, uint256 total, uint64 claimableAt, bytes32 inputs)',
  'event SettlementVetoed(uint256 indexed index)',
  'event Claimed(address indexed account, uint256 indexed index, uint256 amount, address via)',
] as const;

const BURN_POOL_FUNCTIONS = [
  'function totalBurned() view returns (uint256)',
  'function committed() view returns (uint256)',
  'function releasable() view returns (uint256)',
  'function head() view returns (uint256)',
  'function settlementCount() view returns (uint256)',
  'function deployedAt() view returns (uint64)',
  'function releaseBpsPerDay() view returns (uint256)',
  'function challengeDelay() view returns (uint64)',
  'function publisher() view returns (address)',
  'function settlements(uint256 index) view returns (bytes32 root, uint256 total, uint64 publishedAt, uint64 claimableAt, bool vetoed, uint256 previous)',
  'function publish(bytes32 root, uint256 total, bytes32 inputs) returns (uint256 index)',
] as const;

const BURN_POOL_ERRORS = [
  'error NotPublisher()',
  'error EmptyRoot()',
  'error SettlementPending(uint256 index)',
  'error TotalDecreased(uint256 committed, uint256 total)',
  'error TotalAboveRelease(uint256 releasable, uint256 total)',
] as const;

export const rigRegistryEvents = parseAbi(RIG_REGISTRY_EVENTS);
export const burnPoolEvents = parseAbi(BURN_POOL_EVENTS);
export const burnPoolAbi = parseAbi([...BURN_POOL_EVENTS, ...BURN_POOL_FUNCTIONS, ...BURN_POOL_ERRORS]);

/** Every event the indexer follows, across both contracts. */
export const indexedEvents = [...rigRegistryEvents, ...burnPoolEvents] as const;
