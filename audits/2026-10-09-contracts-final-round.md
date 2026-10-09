# Contracts audit, final round before mainnet

| | |
|---|---|
| **Date** | 2026-10-09 |
| **Auditors** | The Minera maintainers. This is an internal audit, not an independent one. |
| **Scope** | `packages/contracts/src` at commit `2b8839a`, the code to be deployed on mainnet; `script/Deploy.s.sol` and `deploy/mainnet.json` |
| **Method** | Diff review against [round 1](2026-10-06-contracts-round-1.md), the test suite, coverage, static analysis, a bytecode comparison with the code running on testnet, and a review of the mainnet parameters and roles |
| **Result** | No critical or high findings. The executable code is the code round 1 audited. 1 medium finding stays acknowledged, and 2 new informational notes cover the mainnet setup. |

## What changed since round 1

- **Contracts:** NatSpec on `disallowZap`, `proposePublisher`, `delistPair` and `isPairListed`
  (round 1, I-07). Nothing else.
- **Deploy script:** the parameter checks (round 1, L-01), the role checks, and ETH-only deployments
  that skip the pair zap when no router and no stock registry are set.
- **Mainnet parameters:** [`deploy/mainnet.json`](../packages/contracts/deploy/mainnet.json).

## What was checked

- **The code is unchanged.** Built from `2b8839a`, each contract's runtime code matches the code
  running on testnet, which round 1 matched to `v0.1.1`, byte for byte outside the constructor
  parameters and the metadata hash. BurnPool: 7,356 code bytes, 0 differences. RigRegistry: 4,749
  bytes, 0 differences. PairZap: 4,252 bytes, 0 differences. Only the metadata hash of BurnPool and
  RigRegistry changed, because their comments did.
- **Tests:** 84 pass, including 6 invariants (256 sequences of depth 64) and fuzz tests with 2,048
  runs. Coverage of `src/` is 100% of lines, statements, branches and functions.
- **Static analysis:** `forge lint` reports the same 9 warnings as round 1, triaged in the
  [audit guide](../packages/contracts/AUDIT.md#static-analysis).
- **Deploy script:** read line by line. The mainnet file passes `Deploy.check` and
  `Deploy.checkRoles`, and `test/Deploy.t.sol` covers every refusal.

## Mainnet parameters

| Parameter | Mainnet | Testnet | Note |
|---|---|---|---|
| Challenge delay (also the zap delay) | 6 hours | 30 minutes | Time for the guardian to veto a bad settlement |
| Publisher rotation delay | 48 hours | 1 hour | A rotation is public for two days before it can act |
| Release limit | 10% of the uncommitted pool per day | 10% | See round 1, L-02 |
| Pair listing delay | 24 hours | 10 minutes | |
| Swap router and stock registry | none | set | ETH-only: no pair zap at launch |

## Findings

| ID | Title | Severity | Status |
|---|---|---|---|
| M-01 | The guardian can reach the funds through a publisher rotation | Medium | Acknowledged: a dedicated key |
| F-01 | The guardian is fixed for the life of these contracts | Informational | Acknowledged |
| F-02 | Claims are ETH-only until a pair zap is deployed and allowed | Informational | Acknowledged |

Round 1's L-01 is fixed in the deploy script, L-02 is documented, and its informational findings
stand as written, with I-07 now fixed.

### M-01: The guardian can reach the funds through a publisher rotation

Unchanged from round 1. For mainnet the owner chose a dedicated guardian key: a wallet created for
this role only, never the deployer or the publisher, which the deploy script enforces. A multisig
wallet would spread the trust across several signers; a dedicated key keeps it in one, held by the
project. Every rotation still waits 48 hours in public before it can act.

### F-01: The guardian is fixed for the life of these contracts

`guardian` is `immutable` in BurnPool and RigRegistry. Moving the role to a multisig later means new
contracts at new addresses. The guardian key must be backed up: if it is lost, no settlement can be
vetoed and no publisher rotated.

### F-02: Claims are ETH-only until a pair zap is deployed and allowed

The first mainnet deployment has no pair zap, so `claimVia` has no allowed zap to route through and
every claim is paid in ETH. A zap deployed later becomes usable 6 hours after the guardian allows it.

## Before the first settlement

- Fund the publisher key, which pays the gas for every settlement.
- Publish the addresses and verify the source of each contract on the explorer.
- Record the deployment in `deployments/4663.json` and the shared package.
