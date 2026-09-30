import type { Hex } from '@minera/shared';
import { decodeErrorResult } from 'viem';
import { ERROR_CODES, WALLET_MESSAGES, errorCode } from '../wallet/errors.ts';
import { burnPoolAbi, pairZapAbi, rigRegistryAbi } from './abi.ts';

const CONTRACT_ERRORS = [...rigRegistryAbi, ...burnPoolAbi, ...pairZapAbi].filter((item) => item.type === 'error');

/**
 * Every contract error the site can meet, as a sentence. Text in backticks is a command or a
 * name the visitor types, and is shown as code.
 */
const REVERT_MESSAGES: Readonly<Record<string, string>> = {
  InvalidAuthorization: 'This deploy code was made for a different wallet or network. Run `code` again with this wallet.',
  AlreadyDeployed: 'A rig with this node address is already deployed. Each node key can be deployed once.',
  PairNotListed: 'That pair is not listed on the registry yet. Choose ETH or another listed token.',
  InvalidName: 'The rig name must be between 1 and 32 bytes long.',
  UnknownSettlement: 'The settlement behind this claim was not found on-chain. Reload the page and try again.',
  Vetoed: 'The settlement behind this claim was vetoed. The next settlement will include your rewards.',
  NotYetClaimable: 'This settlement is still in its challenge delay. Try again once it is claimable.',
  InvalidProof: 'The proof does not match the settlement. Reload the page and try again.',
  NothingToClaim: 'There is nothing left to claim for this wallet.',
  AboveSettlementTotal: 'This settlement has no room left for the claim. Try again after the next settlement.',
  TransferFailed: 'The pool could not send ETH to this wallet.',
  ZapNotAllowed: 'Claims into a stock token are not enabled yet. Claim in ETH instead.',
  UnknownPair: 'That token has no swap route. Claim in ETH instead.',
  Expired: 'The quote expired before the transaction was included. Try again.',
  RecipientBlocked: 'The stock token blocks this wallet from receiving it. Claim in ETH instead.',
  MarketPaused: 'The market for this stock token is paused. Claim in ETH instead, or try again later.',
  AmountTooLarge: 'The amount is too large for one swap. Claim in ETH instead.',
  InsufficientOutput: 'The price moved more than the allowed 1% since the quote. Get a new quote and try again.',
};

const UNEXPLAINED = 'The transaction would fail, and the contract gave no reason this page knows. Nothing was sent.';
const NO_FUNDS = 'Your wallet does not have enough ETH to pay the network fee.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The revert data inside a wallet error. Wallets nest it differently: in `data`, `data.data`,
 * `data.originalError.data`, `error.data` or `cause.data`, so the error is searched a few levels deep.
 */
function revertData(error: unknown, depth = 0): Hex | null {
  if (!isRecord(error) || depth > 4) return null;
  const direct = error.data;
  if (typeof direct === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(direct)) return direct as Hex;
  for (const key of ['data', 'error', 'cause', 'originalError']) {
    const found = revertData(error[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function mentionsNoFunds(error: unknown): boolean {
  return isRecord(error) && typeof error.message === 'string' && /insufficient funds/i.test(error.message);
}

/** A failed simulation or send, as one sentence. */
export function describeTransactionError(error: unknown): string {
  const code = errorCode(error);
  if (code === ERROR_CODES.userRejected) return WALLET_MESSAGES.rejected;
  if (code === ERROR_CODES.requestPending) return WALLET_MESSAGES.pending;
  if (code === ERROR_CODES.unauthorized) return WALLET_MESSAGES.unauthorized;
  const data = revertData(error);
  if (data) {
    try {
      const { errorName } = decodeErrorResult({ abi: CONTRACT_ERRORS, data });
      return REVERT_MESSAGES[errorName] ?? UNEXPLAINED;
    } catch {
      return UNEXPLAINED;
    }
  }
  if (mentionsNoFunds(error)) return NO_FUNDS;
  return WALLET_MESSAGES.failed;
}
