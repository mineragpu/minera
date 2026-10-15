import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, encodeErrorResult, getAddress } from 'viem';
import { describeClaimFailure, operatorOf, readyClaim } from './claim.ts';

const NODE = '0x92f6da0c67411ac7e01a3247cd7770871a081ad2';
const LEAF = `0x${'ab'.repeat(32)}`;

const view = (overrides: Record<string, unknown> = {}) => ({
  account: '0x875d0145e0b56e701dbdf32c92dbedf46404c74d',
  cumulative: '300000000000000',
  claimed: '100000000000000',
  claimable: '200000000000000',
  settlement: { index: 7, root: LEAF, claimableAt: '2026-10-15T10:00:00.000Z' },
  proof: [LEAF, LEAF],
  pending: null,
  ...overrides,
});

describe('readyClaim', () => {
  it('reads a claim the coordinator offers', () => {
    assert.deepEqual(readyClaim(view()), {
      index: 7,
      cumulative: 300_000_000_000_000n,
      claimable: 200_000_000_000_000n,
      proof: [LEAF, LEAF],
    });
  });

  it('returns null when no settlement is claimable', () => {
    assert.equal(readyClaim(view({ settlement: null, proof: [] })), null);
  });

  it('refuses a malformed answer rather than build a transaction from it', () => {
    assert.throws(() => readyClaim(null), /not an object/);
    assert.throws(() => readyClaim(view({ settlement: { index: -1 } })), /index is invalid/);
    assert.throws(() => readyClaim(view({ settlement: { index: 1.5 } })), /index is invalid/);
    assert.throws(() => readyClaim(view({ cumulative: '1e18' })), /cumulative amount is invalid/);
    assert.throws(() => readyClaim(view({ claimable: '-1' })), /claimable amount is invalid/);
    assert.throws(() => readyClaim(view({ proof: ['0x1234'] })), /proof is invalid/);
    assert.throws(() => readyClaim(view({ proof: Array(65).fill(LEAF) })), /proof is invalid/);
    assert.throws(() => readyClaim(view({ claimable: '400000000000000' })), /exceeds the cumulative/);
  });
});

describe('operatorOf', () => {
  it('reads and checksums the operator', () => {
    const lower = '0x875d0145e0b56e701dbdf32c92dbedf46404c74d';
    assert.equal(operatorOf({ operator: lower }), getAddress(lower));
    assert.notEqual(operatorOf({ operator: lower }), lower);
  });

  it('refuses a rig view without one', () => {
    assert.throws(() => operatorOf({}), /no operator/);
    assert.throws(() => operatorOf({ operator: '0x12' }), /no operator/);
  });
});

describe('describeClaimFailure', () => {
  it('asks for gas when the node address cannot pay the fee', () => {
    const error = new BaseError('send failed', { cause: new InsufficientFundsError() });
    assert.equal(describeClaimFailure(error, NODE), `The node address ${NODE} needs a little ETH to pay the claim's network fee.`);
  });

  it('names the Burn Pool refusal in plain words', () => {
    const abi = [{ type: 'error', name: 'NothingToClaim', inputs: [] }] as const;
    const revert = new ContractFunctionRevertedError({ abi, functionName: 'claim', data: encodeErrorResult({ abi, errorName: 'NothingToClaim' }) });
    const error = new BaseError('simulation failed', { cause: revert });
    assert.equal(describeClaimFailure(error, NODE), 'The Burn Pool refused the claim: everything in this settlement is already claimed.');
  });

  it('passes on other reasons', () => {
    assert.match(describeClaimFailure(new BaseError('execution reverted'), NODE), /^The claim was not sent: execution reverted/);
    assert.equal(describeClaimFailure(new Error('timeout'), NODE), 'The claim was not sent: timeout');
  });
});
