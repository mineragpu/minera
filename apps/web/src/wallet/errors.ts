/** Every wallet problem the site reports, as a sentence a person can act on. */
export const WALLET_MESSAGES = {
  rejected: 'You rejected the request in your wallet.',
  noWallet: 'No wallet found. Install a browser wallet to continue.',
  pending: 'Your wallet already has a request open. Finish it there, then try again.',
  noAccount: 'Your wallet shared no account. Unlock it and try again.',
  notConnected: 'Connect a wallet first.',
  unauthorized: 'Your wallet has not approved this site. Connect again to continue.',
  unsupported: 'This wallet does not support that request.',
  failed: 'The wallet could not complete the request. Try again.',
} as const;

/** EIP-1193 and JSON-RPC error codes the site handles. */
export const ERROR_CODES = {
  userRejected: 4001,
  unauthorized: 4100,
  unsupportedMethod: 4200,
  unrecognizedChain: 4902,
  requestPending: -32002,
  internal: -32603,
} as const;

function ownCode(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined;
  return typeof value.code === 'number' ? value.code : undefined;
}

/** The provider error code, looking through the wrapper some wallets put around the original. */
export function errorCode(error: unknown): number | undefined {
  const code = ownCode(error);
  if (code !== undefined && code !== ERROR_CODES.internal) return code;
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data;
    if (typeof data === 'object' && data !== null && 'originalError' in data) {
      return ownCode(data.originalError) ?? code;
    }
  }
  return code;
}

export function describeWalletError(error: unknown): string {
  switch (errorCode(error)) {
    case ERROR_CODES.userRejected:
      return WALLET_MESSAGES.rejected;
    case ERROR_CODES.requestPending:
      return WALLET_MESSAGES.pending;
    case ERROR_CODES.unauthorized:
      return WALLET_MESSAGES.unauthorized;
    case ERROR_CODES.unsupportedMethod:
      return WALLET_MESSAGES.unsupported;
    default:
      return WALLET_MESSAGES.failed;
  }
}
