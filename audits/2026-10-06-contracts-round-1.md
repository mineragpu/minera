# Contracts audit, round 1

| | |
|---|---|
| **Date** | 2026-10-06 |
| **Auditors** | The Minera maintainers. This is an internal audit, not an independent one. |
| **Scope** | `packages/contracts/src` at tag [`v0.1.1`](https://github.com/mineragpu/minera/releases/tag/v0.1.1): `BurnPool.sol`, `RigRegistry.sol`, `PairZap.sol` and `interfaces/`, 413 nSLOC |
| **Deployment checked** | The testnet contracts at the addresses in [`deployments/46630.json`](../packages/contracts/deployments/46630.json) |
| **Method** | Line-by-line review against the [audit guide](../packages/contracts/AUDIT.md), the test suite, coverage, static analysis and a bytecode comparison with the chain |
| **Result** | No critical or high findings. 1 medium, 2 low and 7 informational findings, listed below with their status. |

Round 1 covers the code running on testnet. The final round covers the exact commit to be deployed
on mainnet and is published here before launch.

## Summary

| ID | Title | Severity | Status |
|---|---|---|---|
| [M-01](#m-01-the-guardian-can-reach-the-funds-through-a-publisher-rotation) | The guardian can reach the funds through a publisher rotation | Medium | Acknowledged, mitigated at deployment |
| [L-01](#l-01-the-constructors-accept-unsafe-delays) | The constructors accept unsafe delays | Low | Fixed in the deploy script |
| [L-02](#l-02-the-release-limit-counts-time-from-the-head-settlement) | The release limit counts time from the head settlement | Low | Acknowledged, documented |
| [I-01](#i-01-eth-forced-into-the-pool-is-not-counted) | ETH forced into the pool is not counted | Informational | Acknowledged |
| [I-02](#i-02-re-listing-or-re-allowing-restarts-the-delay) | Re-listing or re-allowing restarts the delay | Informational | Acknowledged |
| [I-03](#i-03-a-publisher-proposal-has-no-cancel) | A publisher proposal has no cancel | Informational | Acknowledged |
| [I-04](#i-04-the-zap-does-not-support-tokens-with-a-transfer-fee) | The zap does not support tokens with a transfer fee | Informational | Acknowledged |
| [I-05](#i-05-rig-names-are-untrusted-text) | Rig names are untrusted text | Informational | Acknowledged |
| [I-06](#i-06-an-account-that-refuses-eth-needs-a-zap) | An account that refuses ETH needs a zap | Informational | Acknowledged |
| [I-07](#i-07-some-functions-have-no-natspec) | Some functions have no NatSpec | Informational | To fix in the mainnet build |

Severity follows impact and likelihood: **critical** and **high** put funds at risk without a trusted
key, **medium** needs a trusted key or an unlikely condition, **low** limits behavior without
putting funds at risk, and **informational** is a note for integrators and reviewers.

## What was checked

- **The code on chain is this code.** For each of the three testnet contracts, the runtime bytecode
  read from the chain has the same length and the same metadata hash as the build of `v0.1.1`, and
  every differing byte lies inside an `immutable` slot, where the constructor writes its
  parameters. BurnPool: 7,409 bytes, 122 in its 5 immutables. RigRegistry: 4,802 bytes, 64 in its
  2 immutables. PairZap: 4,305 bytes, 100 in its 2 immutables.
- **Every line was read** for access control, accounting, reentrancy, arithmetic and casts, signature
  handling, external calls and their ordering, events, and the behavior under a compromised key.
- **The properties in the audit guide** each have a test, and the suite passes: 78 tests including 6
  invariants (256 sequences of depth 64) and fuzz tests with 2,048 runs.
- **Coverage** of `src/` is 100% of lines, statements, branches and functions.
- **Static analysis:** `forge lint` reports 9 warnings, all triaged in the
  [audit guide](../packages/contracts/AUDIT.md#static-analysis). None is a vulnerability.
- **Arithmetic:** `releasable()` multiplies at most the ETH supply by the rate and the elapsed time,
  far below 2^256. Every timestamp cast to `uint64` stays in range for any realistic delay; L-01 now
  bounds the delays.

## Findings

### M-01: The guardian can reach the funds through a publisher rotation

**Contract:** `BurnPool.sol`, `proposePublisher`, `applyPublisher`, `publish`

The guardian has no function that moves funds, but it can propose a new publisher. After the
rotation delay anyone can apply it, and the new publisher can publish settlements that pay any
account, within the release limit. A guardian acting in bad faith would not veto them.

**Impact:** whoever controls the guardian key can, after a public delay, direct releases from the
pool at the release limit's pace.

**Recommendation:** on mainnet, make the guardian a multisig wallet with independent signers, and
set a rotation delay long enough for the community to see a rotation and react.

**Status:** acknowledged. The rotation is public for the whole rotation delay, and the
[security page](https://mineragpu.tech/docs/security) states this as the largest trust assumption.
The mainnet checklist in the audit guide requires a multisig guardian.

### L-01: The constructors accept unsafe delays

**Contract:** `BurnPool.sol` and `RigRegistry.sol`, constructors

The delays are not bounded. A challenge delay of zero would make every settlement final when it is
published, so it could never be vetoed. A delay close to `2^64` would make
`uint64(block.timestamp) + delay` overflow, so `publish`, `allowZap`, `proposePublisher` or
`listPair` would always revert.

**Recommendation:** check the parameters before deploying.

**Status:** fixed in the deploy script. `Deploy.check` now refuses a zero challenge or listing delay,
a rotation delay shorter than the challenge delay, any delay over a year, a release rate outside 1
to 10,000 basis points and a zero router or registry. `test/Deploy.t.sol` covers each case, and the
testnet parameters pass. The contracts themselves are unchanged, so the deployed code still matches.

### L-02: The release limit counts time from the head settlement

**Contract:** `BurnPool.sol`, `releasable`

The limit grows with the time since the head settlement was published and applies to the current
uncommitted balance, including ETH burned after that settlement. After a long gap with no
settlement, a large share of a fresh deposit can be committed at once: at a 10% daily rate, all of
it after ten days.

**Impact:** the limit slows releases while settlements are regular, as intended, but does not age
each deposit separately.

**Status:** acknowledged as a design choice, and documented in the audit guide and the
[security page](https://mineragpu.tech/docs/security). Every settlement still waits out the
challenge delay.

### I-01: ETH forced into the pool is not counted

ETH can reach a contract without calling it, through `selfdestruct` or as a block reward. That ETH
does not pass through `_burn`, so it is not added to `totalBurned`, can never be committed, and stays
in the pool for good. The pool's balance is then above `totalBurned - totalClaimed`, never below.
No one gains from it, and the audit guide states the balance property with this exception.

### I-02: Re-listing or re-allowing restarts the delay

Calling `listPair` for a listed asset, or `allowZap` for an allowed zap, writes a new start time, so
the asset or zap is unusable again until the delay passes. Only the guardian can do this, and it
can delist or disallow directly anyway.

### I-03: A publisher proposal has no cancel

A pending proposal can only be replaced. To withdraw one, the guardian proposes the current
publisher, which turns the pending rotation into a no-op.

### I-04: The zap does not support tokens with a transfer fee

`PairZap.deliver` measures what the swap delivered and forwards exactly that. A token that takes a
fee on transfer would leave the account with less than its minimum. Assets are listed by the
guardian, who must check this before listing one.

### I-05: Rig names are untrusted text

`RigRegistry.deploy` checks only that a name has 1 to 32 bytes. Names reach the coordinator and the
site through the `RigDeployed` event, and both treat them as data: the coordinator stores them
through parameterized queries and serves them as JSON, and the site renders them as text, never as
markup.

### I-06: An account that refuses ETH needs a zap

`claim` sends ETH with a plain call. An account that reverts on receiving ETH cannot use it; it can
claim through `claimVia` if it can make the call itself. Its entitlement stays claimable meanwhile.

### I-07: Some functions have no NatSpec

`disallowZap`, `proposePublisher`, `delistPair` and `isPairListed` have no NatSpec comments. Adding
them now would change the source that is verified on the explorer, so they are added in the
mainnet build, which is audited in the final round.

## Reproduce

From `packages/contracts`, at tag `v0.1.1` plus the deploy script check:

```sh
forge soldeer install
forge test
forge coverage --no-match-coverage "(test|script|dependencies)" --no-match-contract Fork --report summary
forge lint src
```

The bytecode comparison reads each address with `cast code` and compares it with
`deployedBytecode` in `out/<Contract>.sol/<Contract>.json` after `forge build`, skipping the byte
ranges listed under `deployedBytecode.immutableReferences`.
