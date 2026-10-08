# Changelog

Every release is listed here with what it adds, changes and fixes, and what operators need to do to
upgrade. Versions follow semantic versioning, and each release is a signed git tag.

## [Unreleased]

### Added

- **Contracts audit, round 1**, in `audits/`: an internal audit of the testnet contracts at
  `v0.1.1`. No critical or high findings; 1 medium, 2 low and 7 informational, each with its status.
  The bytecode on chain matches the source byte for byte outside the constructor parameters.
- **Deploy checks:** the deploy script refuses a zero challenge or listing delay, a rotation delay
  shorter than the challenge delay, any delay over a year, a release rate outside 1 to 10,000 basis
  points and a missing router or registry (audit finding L-01).
- **Mainnet role checks:** the deploy script refuses a guardian that is also the publisher, and on
  mainnet a guardian without contract code or a challenge delay under an hour (audit finding M-01).
- **Token address on the site:** once the token contract address is set in the shared package, the
  FAQ and the footer publish it, so there is one reference to check an address against.

### Changed

- The site, the docs and the audit guide describe the audits as they are run: internal, in rounds,
  with every report published in full, and a final round on the exact code to deploy before mainnet.

## [0.1.1] - 2026-10-04

The node client is on npm. Nothing changes on chain or in the node protocol.

### Added

- **The node client on npm** as `@minera-gpu/miner`. `npm install --global @minera-gpu/miner`
  installs the `rig` command, built as one JavaScript file that runs on Node.js 22 or later.
- **A release workflow** that publishes the node client from each signed release tag through npm's
  trusted publishing, with a provenance statement and no stored token. Release candidates go to the
  `next` tag; `latest` only ever points at a full release. CONTRIBUTING.md describes the steps.
- **Audit guide** for the contracts, in `packages/contracts/AUDIT.md`: the scope, the roles, the
  properties that must hold with the test that checks each one, the behavior already known, and a
  triage of the static analysis.
- **Contract tests** for every revert path that had none, a reentrancy test against a claimant that
  calls back, and an invariant that the head settlement is never a vetoed one. Coverage of the
  contracts is now 100% of lines, statements, branches and functions.
- **Code owners:** pull requests request the maintainer's review, and branch protection requires
  it.

### Changed

- The quickstart, the deploy guide and the Deploy page install the node client from npm and run
  `rig`. Running from a clone still works.
- The node client's workspace is now named `@minera-gpu/miner`, like the published package.

### Removed

- The best practices autofill file. The badge is earned, and its answers live on the badge service.

### Upgrade notes

- **Node operators** can switch to the npm package with `npm install --global @minera-gpu/miner`
  and run `rig` instead of `node packages/miner/src/cli.ts`. The node key and settings stay in the
  same per-user directory, so nothing needs to be set up again.

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

[Unreleased]: https://github.com/mineragpu/minera/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/mineragpu/minera/releases/tag/v0.1.1
[0.1.0]: https://github.com/mineragpu/minera/releases/tag/v0.1.0
