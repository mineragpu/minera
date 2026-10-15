/**
 * Claiming the operator's rewards from the node. The Burn Pool's `claim` pays the account named in
 * the proof whoever sends it, so the node key only pays the network fee: it cannot send the ETH
 * anywhere else. The call is simulated before it is sent, so a claim that would fail costs nothing.
 */

import { CHAINS, deploymentFor, type Address, type Hex, type NetworkKey } from '@minera/shared';
import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  type LocalAccount,
} from 'viem';

/** What the coordinator says the operator can claim now, checked field by field. */
export interface ReadyClaim {
  index: number;
  cumulative: bigint;
  claimable: bigint;
  proof: Hex[];
}

export type SendClaim = (operator: Address, claim: ReadyClaim) => Promise<Hex>;

const MAX_PROOF_LENGTH = 64;
const WEI = /^\d{1,78}$/;
const NODE = /^0x[0-9a-fA-F]{64}$/;

const CLAIM_ABI = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'index', type: 'uint256' },
      { name: 'account', type: 'address' },
      { name: 'cumulative', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  { type: 'error', name: 'NotYetClaimable', inputs: [{ name: 'index', type: 'uint256' }, { name: 'claimableAt', type: 'uint64' }] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'UnknownSettlement', inputs: [{ name: 'index', type: 'uint256' }] },
  { type: 'error', name: 'Vetoed', inputs: [{ name: 'index', type: 'uint256' }] },
  { type: 'error', name: 'AboveSettlementTotal', inputs: [{ name: 'total', type: 'uint256' }, { name: 'wouldClaim', type: 'uint256' }] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
] as const;

/** What each Burn Pool refusal means for the operator. */
const REFUSALS: Readonly<Record<string, string>> = {
  NotYetClaimable: 'the settlement is still inside its challenge delay',
  NothingToClaim: 'everything in this settlement is already claimed',
  InvalidProof: "the coordinator's proof does not match the settlement on chain",
  UnknownSettlement: 'the chain does not know this settlement yet',
  Vetoed: 'the guardian vetoed this settlement',
  AboveSettlementTotal: "the claim would exceed the settlement's total",
  TransferFailed: "the operator's wallet refused the ETH",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Reads `GET /v1/claims/:account`. Returns null when nothing is claimable now, and throws when the
 * answer is malformed, so a bad reply never turns into a transaction.
 */
export function readyClaim(view: unknown): ReadyClaim | null {
  if (!isRecord(view)) throw new Error('The claim view is not an object.');
  const settlement = view['settlement'];
  if (settlement === null) return null;
  if (!isRecord(settlement)) throw new Error('The claim view has no settlement.');
  const index = settlement['index'];
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) throw new Error('The settlement index is invalid.');
  const { cumulative, claimable, proof } = view;
  if (typeof cumulative !== 'string' || !WEI.test(cumulative)) throw new Error('The cumulative amount is invalid.');
  if (typeof claimable !== 'string' || !WEI.test(claimable)) throw new Error('The claimable amount is invalid.');
  if (!Array.isArray(proof) || proof.length > MAX_PROOF_LENGTH || !proof.every((node) => typeof node === 'string' && NODE.test(node))) {
    throw new Error('The proof is invalid.');
  }
  if (BigInt(claimable) > BigInt(cumulative)) throw new Error('The claimable amount exceeds the cumulative amount.');
  return { index, cumulative: BigInt(cumulative), claimable: BigInt(claimable), proof: proof as Hex[] };
}

/** The operator's address from `GET /v1/rigs/:nodeKey`, checked. */
export function operatorOf(rig: unknown): Address {
  const operator = isRecord(rig) ? rig['operator'] : undefined;
  if (typeof operator !== 'string' || !isAddress(operator, { strict: false })) throw new Error('The rig view has no operator.');
  return getAddress(operator);
}

/** A short reason for a failed claim that an operator can act on. */
export function describeClaimFailure(error: unknown, node: Address): string {
  if (error instanceof BaseError && error.walk((cause) => cause instanceof InsufficientFundsError)) {
    return `The node address ${node} needs a little ETH to pay the claim's network fee.`;
  }
  if (error instanceof BaseError) {
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name !== undefined) return `The Burn Pool refused the claim: ${REFUSALS[name] ?? name}.`;
    return `The claim was not sent: ${error.shortMessage}`;
  }
  return `The claim was not sent: ${error instanceof Error ? error.message : String(error)}`;
}

export interface ClaimSenderOptions {
  network: NetworkKey;
  rpcUrl: string;
  /** The node key's account. It signs the transaction; the private key stays in the keystore. */
  account: LocalAccount;
}

export function createClaimSender({ network, rpcUrl, account }: ClaimSenderOptions): SendClaim {
  const config = CHAINS[network];
  const deployment = deploymentFor(config.id);
  if (deployment === undefined) throw new Error(`No Burn Pool is deployed on ${network}.`);
  const chain = defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const transport = http(rpcUrl, { timeout: 30_000, retryCount: 1 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return async (operator, claim) => {
    const { request } = await publicClient.simulateContract({
      account,
      address: deployment.burnPool,
      abi: CLAIM_ABI,
      functionName: 'claim',
      args: [BigInt(claim.index), operator, claim.cumulative, claim.proof],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== 'success') throw new Error(`The claim transaction ${hash} reverted.`);
    return hash;
  };
}
