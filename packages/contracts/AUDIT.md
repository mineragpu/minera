# Audit guide

This page is for anyone reviewing the Minera contracts, from the maintainers' own audit rounds to
an independent reader. It sets the scope, the roles, the properties that must hold and the behavior
we already know about, so a review can start from the questions that matter.

**Status:** the maintainers audit the contracts in rounds and publish every report, unedited, in
[`audits/`](../../audits). [Round 1](../../audits/2026-10-06-contracts-round-1.md), on the testnet
code, found no critical or high issues. The final round covers the exact commit to be deployed on
mainnet and comes before launch. The audits are internal; independent review is welcome.

## Scope

| File | nSLOC | What it does |
|---|---:|---|
| [`src/BurnPool.sol`](src/BurnPool.sol) | 209 | Holds the ETH that pays rewards. Settlements commit cumulative entitlements as a Merkle root; claims pay them out in ETH or through an allowed zap. |
| [`src/PairZap.sol`](src/PairZap.sol) | 106 | Converts a claim from ETH into the stock token a rig is paired with, over a route fixed at deployment. |
| [`src/RigRegistry.sol`](src/RigRegistry.sol) | 85 | Binds a GPU node's key to its operator's wallet and records the asset the rig's rewards pair with. |
| [`src/interfaces/`](src/interfaces) | 13 | The zap, stock registry and swap router interfaces. |
| **Total** | **413** | |

- **Compiler:** Solidity 0.8.30, EVM version cancun, optimizer on with 10,000 runs
  ([`foundry.toml`](foundry.toml)).
- **Dependencies:** `MerkleProof`, `ECDSA`, `MessageHashUtils`, `IERC20` and `SafeERC20` from the
  contracts library pinned at 5.4.0 in [`soldeer.lock`](soldeer.lock). `forge-std` is used by tests
  only.
- **No upgrades, no owner.** There is no proxy, no `selfdestruct`, no `delegatecall` and no admin
  function that moves funds. Every parameter is immutable.
- **Out of scope:** the tests, the deploy script (read it for configuration only), the coordinator,
  the site, and the external swap router and stock registry, which are treated as given.

## The system in one minute

1. **Burn.** Anyone sends ETH to the Burn Pool with `burn` or a plain transfer. It never comes back
   out except as a claim.
2. **Publish.** The coordinator's publisher key publishes a settlement: a Merkle root over
   `(account, cumulative amount)` leaves and the settlement's total. The total may not decrease and
   may not exceed the release limit.
3. **Challenge.** The settlement becomes claimable after the challenge delay. Until then the
   guardian may veto it, and no other settlement can be published.
4. **Claim.** `claim` pays an account's unclaimed amount in ETH to that account; anyone may trigger
   it. `claimVia` lets the account itself route its claim through a zap the guardian allowed after
   a public delay.
5. **Rigs.** An operator deploys a rig in the registry with a signature from the rig's node key, and
   picks the asset its rewards pair with: ETH, or a listed stock token.

Leaves are `keccak256(bytes.concat(keccak256(abi.encode(account, cumulative))))`, sorted-pair
hashing, the standard Merkle tree format. Amounts are cumulative, so each settlement pays only the
difference from what an account already claimed.

## Roles

| Role | Can | Cannot |
|---|---|---|
| **Publisher** | Publish a settlement within the release limit, when no other settlement is in its challenge delay. | Lower the committed total, exceed the release limit, move funds, or make a settlement claimable early. |
| **Guardian** | Veto a settlement inside its challenge delay. Schedule a zap (usable after the challenge delay) and disable it at once. Propose a publisher (effective after the rotation delay). List a pair asset (usable after the listing delay) and delist it at once. | Call any function that moves ETH or tokens. See the first item under [Known behavior](#known-behavior) for the indirect path. |
| **Account** | Claim its own entitlement through `claimVia`, choosing the zap and the swap terms. | Claim more than its cumulative amount, or past a settlement's total. |
| **Anyone** | Burn, trigger `claim` for any account (the ETH always goes to that account), apply a publisher rotation whose delay has passed, call the zap with its own ETH. | Change who receives a claim. |
| **Operator** | Deploy a rig with its node key's signature, change the rig's pair, retire the rig. | Deploy a node key without that key's signature for this operator, registry and chain. |

## Properties that must hold

Each property is checked by a test. The invariant suite runs 256 sequences of depth 64 over burns,
publications, vetoes, claims and waits; fuzz tests run 2,048 cases.

| Property | Checked by |
|---|---|
| The pool's balance is everything burned minus everything claimed, plus any ETH forced in without a call (audit I-01). | `invariant_BalanceIsBurnedMinusClaimed` |
| Claims never exceed the committed total, and claimants receive exactly what they claimed. | `invariant_ClaimsNeverExceedCommitted`, `invariant_ClaimantsReceivedExactlyWhatTheyClaimed` |
| The committed total and the release limit never exceed what was burned. | `invariant_CommittedNeverExceedsBurned`, `invariant_ReleasableNeverExceedsBurned`, `testFuzz_ReleasableNeverExceedsWhatWasBurned` |
| The head settlement is never a vetoed one. | `invariant_HeadIsNeverVetoed` |
| One day releases exactly the configured share of the uncommitted balance. | `testFuzz_OneDayReleasesTheConfiguredShare` |
| A settlement's total never decreases and never exceeds the release limit. | `test_RevertWhen_TotalDecreases`, `test_RevertWhen_PublishAboveRelease` |
| At most one settlement is inside its challenge delay at a time. | `test_RevertWhen_PreviousSettlementPending` |
| Each cumulative amount pays once, and a later settlement pays only the difference. | `test_RevertWhen_ClaimTwice`, `test_LaterSettlementPaysOnlyTheDifference` |
| Claims under one settlement never add up past its total. | `test_ClaimsNeverExceedTheSettlementTotal` |
| A claim cannot be reentered, and a refused payment leaves the claim intact. | `test_ClaimCannotBeReentered`, `test_RefusedPaymentRevertsAndStaysClaimable` |
| Only the account can route its claim through a zap, and only an allowed, enabled zap. | `test_RevertWhen_SomeoneElseUsesTheZap`, `test_RevertWhen_ZapNotYetEnabled`, `test_RevertWhen_ZapDisabled` |
| A rig needs its node key's signature for this operator, registry and chain. | `test_RevertWhen_AuthorizationIsForAnotherOperator`, `test_RevertWhen_AuthorizationIsFromAnotherKey`, `test_DigestBindsChainRegistryAndOperator` |
| The zap delivers at least the claimant's minimum, even if the router does not check it, and never pays out tokens it held before the swap. | `test_RevertWhen_OutputBelowMinimumEvenIfTheRouterDoesNotCheck`, `test_DeliversTheStockToTheAccount` |

## Known behavior

Found in our own review. None of it is a bug in our reading, but each deserves a second look.

1. **A compromised guardian can reach the funds, slowly and in public.** The guardian has no
   function that moves funds, but it can propose a new publisher. After the rotation delay that
   publisher can publish settlements paying anyone, within the release limit, and a compromised
   guardian would not veto them. The rotation is an on-chain event, public for the whole rotation
   delay. On mainnet the guardian should be a multisig wallet.
2. **A compromised publisher is bounded, not stopped.** It can publish roots within the release
   limit. The guardian must veto each one inside its challenge delay and rotate the publisher, and
   another root can be published after each veto.
3. **The pool checks totals, not the split.** A settlement's total is bounded on chain; how it is
   divided between accounts is not. The coordinator publishes each settlement's inputs and full
   tree, and their digest is in the `SettlementPublished` event, so anyone can recompute the root.
4. **The release limit is linear and measured from the head settlement.** The cap grows with the
   time since the head settlement was published, applied to the current uncommitted balance,
   including ETH burned after that settlement. After a long gap, a large share of a fresh deposit
   can be committed at once; at a 10% daily rate, everything uncommitted after ten days. A vetoed
   settlement does not reset the clock, because the head returns to the previous settlement.
5. **Older settlements stay claimable.** Because amounts are cumulative, a claim may use any final,
   unvetoed settlement. A claim under an older one can fail with `AboveSettlementTotal` once later
   claims have used up its total; the newest settlement still pays it.
6. **An account that cannot receive ETH** can only claim through a zap, and only if it can call
   `claimVia` itself. Otherwise its entitlement stays claimable in the pool.
7. **Allowed zaps are trusted by the accounts that choose them.** A zap the guardian allows can
   receive only the claims of accounts that pick it, after the public delay. Disabling a zap takes
   effect at once.
8. **The zap is permissionless and keeps nothing.** Anyone can swap their own ETH through
   `deliver`. Output is measured as the balance change, so tokens already held by the zap are never
   paid out, and there is no sweep function for tokens sent to it by mistake. Stock tokens that take
   a fee on transfer are not supported: the account would receive less than its minimum.
9. **A rig's pair is a default, not a rule.** The registry records it, but `claimVia` does not read
   the registry: an account may claim into any asset the zap routes. Delisting an asset stops new
   rigs and changes to it; rigs already paired keep it.
10. **Rig names are untrusted text.** The registry checks only their length, 1 to 32 bytes. They
    reach consumers through the `RigDeployed` event, which must treat them as data.
11. **Delays are block time, and are not bounded in the constructor.** A challenge delay of zero
    would make settlements final at once. The values are set per network in
    [`deploy/`](deploy) and are part of the review; see the checklist below.
12. **Node keys cannot be reused or transferred.** A retired rig's key can never be deployed again,
    and a rig cannot move to another operator.
13. **ETH forced into the pool is not counted.** ETH sent by `selfdestruct` or as a block reward
    skips `_burn`, so it never joins `totalBurned` and stays in the pool for good.

## Static analysis

`forge lint` (Foundry 1.8.3) on `src/` reports 9 warnings. Our triage:

| Lint | Where | Triage |
|---|---|---|
| `arbitrary-send-eth` | `BurnPool.sol:173` | ETH goes to the account in a proven leaf, for the proven amount only. By design. |
| `arbitrary-send-eth` | `BurnPool.sol:188` | ETH goes only to a zap the guardian allowed after the public delay, chosen by the claimant. By design. |
| `reentrancy-eth` | `BurnPool.sol:173` | State is written before the transfer, and `nonReentrant` holds the lock through it. Covered by `test_ClaimCannotBeReentered`. |
| `reentrancy-events` | `BurnPool.sol:172`, `BurnPool.sol:187` | The events are emitted before the external call. False positive. |
| `reentrancy-events` | `PairZap.sol:93` | `Delivered` follows the swap. The zap keeps no state between calls, so a reentrant call can only make another swap of its own ETH. Informational. |
| `reentrancy-events` | `RigRegistry.sol:75` | The only call before the event is signature recovery. False positive. |
| `require-revert-in-loop` | `PairZap.sol:70`, `PairZap.sol:71` | Route checks in the constructor, which runs once. By design. |

## Run it

With Foundry 1.8.3, from `packages/contracts`:

```sh
forge soldeer install
forge build --sizes
forge test
forge coverage --no-match-coverage "(test|script|dependencies)" --no-match-contract Fork --report summary
forge lint src
```

On 2026-10-06: 78 tests pass, and coverage of `src/` is 100% of lines, statements, branches and
functions. `test/PairZap.fork.t.sol` runs the zap against the live testnet router when a testnet RPC
URL is set, and is skipped otherwise. CI runs the formatting check, the build and every test on each
push and pull request.

## Deployment

The testnet deployment matches tag [`v0.1.1`](https://github.com/mineragpu/minera/releases/tag/v0.1.1)
byte for byte outside the constructor parameters (audit round 1),
with the parameters in [`deploy/testnet.json`](deploy/testnet.json):

| Parameter | Testnet value |
|---|---|
| Challenge delay (also the zap delay) | 1,800 s (30 minutes) |
| Publisher rotation delay | 3,600 s (1 hour) |
| Release limit | 1,000 bps (10%) of the uncommitted balance per day |
| Pair listing delay | 600 s (10 minutes) |

Addresses are in [`deployments/46630.json`](deployments/46630.json) and
[docs/contracts.md](../../docs/contracts.md). Each contract is verified on the explorer with an
exact source match.

`Deploy.check` in [`script/Deploy.s.sol`](script/Deploy.s.sol) refuses unsafe parameters before
anything is deployed: a zero challenge or listing delay, a rotation delay shorter than the challenge
delay, any delay over a year, a release rate outside 1 to 10,000 basis points, or a missing router
or registry. `Deploy.checkRoles` refuses a guardian that is also the publisher, and on mainnet a
guardian that is not a contract or a challenge delay under an hour.

Before mainnet, together with the final audit round:

- [ ] The audited commit is the deployed commit, and every contract is source-verified.
- [ ] The guardian is a multisig wallet; the publisher is a separate key held by the coordinator.
      On mainnet the deploy script refuses a guardian without contract code, or one that is also
      the publisher.
- [ ] The challenge delay gives the guardian time to react (hours, not minutes).
- [ ] The rotation delay is longer than the challenge delay.
- [ ] The release limit and listing delay are set in `deploy/mainnet.json` and reviewed.
- [ ] Every route in the zap points at a pool with real liquidity and a hookless native-ETH pair.

## Questions for reviewers

1. Can any order of burns, publications, vetoes and claims pay out more than a settlement's total,
   or more than was burned?
2. Can the release limit be exceeded, for example by vetoing and republishing, or at timestamp
   edges?
3. Can a claim through `claimVia` reach anyone other than the account, or a zap it did not choose?
4. Is the deploy signature safe from replay across chains, registries and operators, and from
   malleability?
5. Does the zap's swap encoding match the router's command set, and are the minimum and deadline
   enforced end to end?

## Report a finding

Report vulnerabilities privately through
[a security advisory](https://github.com/mineragpu/minera/security/advisories/new).
[SECURITY.md](../../SECURITY.md) has the scope and response times.
