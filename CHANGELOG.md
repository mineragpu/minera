# Changelog

Every release is listed here with what it adds, changes and fixes, and what operators need to do to
upgrade. Versions follow semantic versioning, and each release is a signed git tag.

## [Unreleased]

### Added

- **Audit guide** for the contracts, in `packages/contracts/AUDIT.md`: the scope, the roles, the
  properties that must hold with the test that checks each one, the behavior already known, and a
  triage of the static analysis.
- **Contract tests** for every revert path that had none, a reentrancy test against a claimant that
  calls back, and an invariant that the head settlement is never a vetoed one. Coverage of the
  contracts is now 100% of lines, statements, branches and functions.

### Removed

- The best practices autofill file. The badge is earned, and its answers live on the badge service.

## [0.1.0] - 2026-10-03

The first release. The whole network runs end to end on the testnet (chain ID 46630): deploy a rig,
take work, get cross-checked, settle and claim. Mainnet has not launched.

### Added

- **Contracts**, deployed on the testnet with verified source:
  - the Burn Pool, with no withdraw function, a daily release limit, a challenge delay and a
    guardian veto that cannot move funds;
  - the rig registry, with signed deploy codes and a pair per rig;
  - the pair zap, for claims paid in a listed tokenized stock.
- **Coordinator:**
  - a signed node protocol with one-time nonces, bound to one chain;
  - job dispatch with cross-checks, measured work units and hourly epochs;
  - cumulative Merkle settlements with a published inputs document;
  - the public API.
- **Sentinel**, the defense against bots, scripts, fake GPUs, sybil rigs and collusion. Its five
  gates are identity, proof of GPU, canary checks, a cross-check with tiebreaks, and reputation
  with probation and quarantine. `GET /v1/sentinel` publishes the gate counts.
- **Node client** (`rig`): node key, deploy code, GPU and runtime detection including the card id,
  and the job loop.
- **Site:** launchpad, deploy flow, rig pages, the Burn Pool, claims in ETH or in the rig's pair,
  the playground, the Sentinel section and the docs.

### Security

- Every database query is parameterized, and a test fails the build otherwise. Node reports are
  held to strict schemas.
- Commits are signed. CodeQL, the OpenSSF Scorecard and Dependabot run on the repository, and
  actions and base images are pinned.
- Fixed a dependency vulnerability: uuid is now 11.1.1, which addresses GHSA-w5hq-g745-h8pq. It is
  reached through a dependency of the settlement tree library. No vulnerability was found in
  Minera's own code.

### Upgrade notes

- **Node operators** should run node client 0.1.0. It reports the card id, and it reports only
  model names and versions the coordinator accepts. The coordinator now needs 60 seconds between
  hellos from the same rig and allows 60 signed requests a minute per rig. The client retries both
  limits on its own.
- **Anyone checking settlements:** settlement inputs are now version 2, in which each rig lists its
  verified units and the units it is paid for.

[0.1.0]: https://github.com/mineragpu/minera/releases/tag/v0.1.0
