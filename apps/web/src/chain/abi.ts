/** The contract functions, events and errors the site calls or decodes, from the deployed sources. */

const address = <const N extends string>(name: N) => ({ name, type: 'address' }) as const;
const uint256 = <const N extends string>(name: N) => ({ name, type: 'uint256' }) as const;

export const rigRegistryAbi = [
  {
    type: 'function',
    name: 'deploy',
    stateMutability: 'nonpayable',
    inputs: [address('nodeKey'), address('pair'), { name: 'name', type: 'string' }, { name: 'authorization', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'RigDeployed',
    anonymous: false,
    inputs: [
      { ...address('nodeKey'), indexed: true },
      { ...address('operator'), indexed: true },
      { ...address('pair'), indexed: true },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
  { type: 'error', name: 'AlreadyDeployed', inputs: [address('nodeKey')] },
  { type: 'error', name: 'PairNotListed', inputs: [address('asset')] },
  { type: 'error', name: 'InvalidName', inputs: [] },
  { type: 'error', name: 'InvalidAuthorization', inputs: [] },
] as const;

export const burnPoolAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [uint256('index'), address('account'), uint256('cumulative'), { name: 'proof', type: 'bytes32[]' }],
    outputs: [uint256('amount')],
  },
  {
    type: 'function',
    name: 'claimVia',
    stateMutability: 'nonpayable',
    inputs: [
      uint256('index'),
      uint256('cumulative'),
      { name: 'proof', type: 'bytes32[]' },
      address('zap'),
      { name: 'data', type: 'bytes' },
    ],
    outputs: [uint256('amount')],
  },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'UnknownSettlement', inputs: [uint256('index')] },
  { type: 'error', name: 'Vetoed', inputs: [uint256('index')] },
  { type: 'error', name: 'NotYetClaimable', inputs: [uint256('index'), { name: 'claimableAt', type: 'uint64' }] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'AboveSettlementTotal', inputs: [uint256('total'), uint256('wouldClaim')] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'ZapNotAllowed', inputs: [address('zap')] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
] as const;

export const pairZapAbi = [
  {
    type: 'function',
    name: 'routeOf',
    stateMutability: 'view',
    inputs: [address('asset')],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [address('asset'), { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }],
      },
    ],
  },
  { type: 'error', name: 'UnknownPair', inputs: [address('asset')] },
  { type: 'error', name: 'Expired', inputs: [uint256('deadline')] },
  { type: 'error', name: 'RecipientBlocked', inputs: [address('account')] },
  { type: 'error', name: 'MarketPaused', inputs: [] },
  { type: 'error', name: 'AmountTooLarge', inputs: [] },
  { type: 'error', name: 'InsufficientOutput', inputs: [uint256('received'), uint256('minimum')] },
] as const;

/**
 * The swap quoter. It is not a view function, but it answers an `eth_call` with its return values:
 * the simulated swap reverts inside the call and the quoter decodes the amount from that revert.
 */
export const quoterAbi = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              address('currency0'),
              address('currency1'),
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              address('hooks'),
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [uint256('amountOut'), uint256('gasEstimate')],
  },
] as const;

/** The claim swap's terms, `abi.encode(asset, minOut, deadline)`, as the pair zap decodes them. */
export const zapTermsAbi = [address('asset'), uint256('minOut'), uint256('deadline')] as const;
