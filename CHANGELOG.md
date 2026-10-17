# Changelog

Every release is listed here with what it adds, changes and fixes, and what operators need to do to
upgrade. Versions follow semantic versioning, and each release is a signed git tag.

## [Unreleased]

### Changed

- **Paid work is limited per prompt source and per pair of rigs.** Prompts from one network can earn
  rigs at most 2,000 paid units an epoch, and two rigs that verify each other at most 2,000 together,
  so nobody can steer the rewards by feeding prompts to their own rigs. Work past a limit is still
  recorded as verified and counts toward standing, but earns nothing. `REWARD_MAX_UNITS_PER_ORIGIN` and
  `REWARD_MAX_UNITS_PER_PAIR` set the limits; `0` turns one off.
- **Each paid unit earns at most 0.0000001 ETH per settlement.** The budget a settlement releases is
  the release limit capped at that rate for every paid unit, so a quiet hour cannot hand the whole
  release to a little work; the rest stays in the Burn Pool. The inputs document (now version 3)
  records the release budget and the cap, so anyone can still redo the split. `REWARD_MAX_WEI_PER_UNIT`
  sets the rate; `0` turns the cap off.

### Added

- **Daily refills for the Burn Pool, listed on the Rewards page.** From October 17, 2026, a dedicated
  refill wallet tops up the mainnet Burn Pool every day as campaign 2, with the memo "daily refill".
  It holds only what the next refills need and has no role in the contracts. The Rewards page gains a
  Top-ups list of every deposit into the pool with its transaction, the home page shows campaign 02 as
  live on mainnet, and *Campaigns* and *Contracts* in the docs describe the refill wallet.
- **Run a rig without your own GPU.** A new docs page, *Where to run a rig*, compares the options:
  your own PC or Mac, a GPU rented by the hour from a marketplace or a cloud, or a dedicated server. A
  rig script served at `mineragpu.tech/rig.sh` sets up a rented Linux GPU machine with one command: it
  installs Node.js 22 (checked against its published SHA-256), a local model runtime and node client
  1.1.0, creates the node key, and starts the node with the model kept installed and, optionally,
  auto-claim. CI checks the script with ShellCheck. The FAQ points to it.
- **A Rewards page on the site,** at `/rewards` and in the top bar: what has been committed to rigs,
  claimed and left waiting, what is still in the pool, the operators who have earned with what each has
  claimed and can claim now, the settlements with what each added and when it becomes claimable, a check
  for any wallet, and the rules that decide the split. It reads `GET /v1/rewards`, a new route that
  gathers all of it in one answer.
- **A work bond contract, not deployed yet.** `RigBond` lets an operator lock ETH behind a rig. Leaving
  takes an unbonding delay during which the guardian can still slash the bond, and slashed ETH is
  burned into the Burn Pool, never paid to the guardian. `script/DeployBond.s.sol` deploys it with the
  parameters in `deploy/<network>-bond.json` (0.005 ETH minimum and 7 days on mainnet) and refuses a
  config whose guardian is not the pool's. Tests cover every line and branch.

- **Token supply on the API.** `GET /v1/token` reports the $MNRA supply read from the chain at one
  block: max, total (minted less the burn address), circulating (total less the project wallet), the
  burn and non-circulating addresses and their balances. `/v1/token/total-supply`,
  `/v1/token/circulating-supply` and `/v1/token/max-supply` return each figure as a plain number for
  listing sites. The counting rules live in `packages/shared/src/token.ts`.

## [1.1.0] - 2026-10-15

Agents arrive: they can read the network and ask it for verified answers, and the node client gains
an autopilot that keeps a rig serving and claims for its operator.

### Changed

- The coordinators moved to addresses on the project's own domain, so they no longer depend on where
  they are hosted: mainnet at `https://api.mineragpu.tech`, testnet at
  `https://testnet-api.mineragpu.tech`.
- **`rig start` needs no coordinator URL.** The node client connects to the project's coordinator for
  its network unless `--coordinator` names another, and a saved address the project has retired is
  replaced with the current one, with a note in the log. `rig status` shows which address it will use.

### Added

- **Autopilot for rigs.** `rig start --keep-model` downloads the model open jobs use when the runtime
  lacks it, and `rig start --auto-claim <eth>` claims the operator's rewards once at least that much is
  claimable: the node address pays the network fee and the Burn Pool pays the operator's wallet.
  While it runs, the node also reports its Sentinel standing and each change to it. `--rpc-url`
  picks the chain endpoint for claims.
- **Security analysis on every change.** Slither and Aderyn read the contracts on every pull request
  and every push to `main`. A finding of medium impact or higher fails the run unless it is fixed or
  reviewed in `packages/contracts/analysis/triage.json` with the reason it is not a bug and the tests
  that show it. The six reported so far are false positives or intended behaviour.
- **An Agents section on the site,** between the playground and the ways in: what an agent can do
  with Minera today (read the network through the MCP server, ask for a verified answer) and what
  comes next (agents that run rigs), each marked as it stands. The roadmap adds an Agents phase.
- **Verified prompts.** `POST /v1/playground/jobs` takes `"verify": true`, which sends the prompt to two
  unrelated rigs every time, so its answer is always cross-checked.
- **Agents can ask the network.** Started with `--allow-ask`, the MCP server offers `minera_ask`: it sends
  a verified prompt, waits for both rigs and returns the answer with how it was checked.
- **An MCP server for AI agents,** in `packages/mcp`: `minera-mcp` lets an agent read the network
  summary, the rigs, one rig, the Burn Pool, one settlement, a wallet's claims and Sentinel's counts
  through the Model Context Protocol. It is read-only: each tool maps onto one GET route of the public
  API, with its arguments checked against a schema first, and it adds no dependency beyond the schema
  library the coordinator already uses. CI builds the package and smoke-tests it.
- **Stock pairs for mainnet, prepared.** `script/DeployZap.s.sol` deploys a pair zap next to an
  existing Burn Pool and rig registry, with the routes in `deploy/mainnet-zap.json`: four tokenized
  stocks, each through a hookless pool against native ETH with real liquidity, and the chain's stock
  registry for the blocklist and pause checks. A fork test runs every route through the live mainnet
  router before anything is deployed. The pairs go live only after the guardian allows the zap (a
  6-hour public delay) and lists each stock (a 24-hour public delay).

### Fixed

- **The coordinator's indexer catches up faster after a refused log request.** A refusal still halves
  the log range, and the range now doubles again after 20 accepted requests in a row instead of staying
  small until the indexer has caught up.

### Upgrade notes

- **Node operators** update with `npm install --global @minera-gpu/miner` and restart with
  `rig start`. The node replaces a retired coordinator address with the project's own on its own.
  Nodes still on 1.0.0 restart once with `--coordinator https://api.mineragpu.tech` on mainnet, or
  `--coordinator https://testnet-api.mineragpu.tech` on testnet.

## [1.0.0] - 2026-10-09

Minera runs on mainnet (chain ID 4663). Rigs deploy and mine there, and claims pay in ETH; claims in
a tokenized stock come later. The testnet keeps running for testing.

### Added

- **Mainnet contracts:** the Burn Pool (0xa9f0BaB0AE7cc4A7B605D831d57A3A2a0E7921D8) and the rig registry
  (0xbe078e15cF90c21Bf23BCFBE94DBC9E44ceFd4d1), deployed from the audited code, ETH-only, and verified on
  Sourcify. Parameters: a 6-hour challenge delay, a 48-hour rotation delay, a 10% daily release
  limit and a 24-hour listing delay. The first burn, 0.001 ETH on campaign 1, opened the pool.
- **The mainnet coordinator**, which indexes the chain through free endpoints: a quiet deployment
  starts at the head, a refused log request shrinks the range down to ten blocks, and RPC URLs may
  carry credentials sent as basic auth. The index and pool intervals and the log range are settings.
- **The node client knows mainnet:** `rig init --network mainnet` deploys against the mainnet registry.
- **Contracts audit, round 1 and final round**, in `audits/`: internal audits, no critical or high
  findings. The bytecode on chain matches the source byte for byte outside the constructor parameters.
- **Deploy checks:** the deploy script refuses unsafe delays, release rates and missing addresses
  (audit L-01), a guardian that is the publisher, and on mainnet a guardian that is the deployer or a
  challenge delay under an hour (audit M-01). ETH-only deploys skip the pair zap.
- **$MNRA on the site:** the token launched on 2026-10-08. Its contract address, with a copy button
  and links to where it trades and to the explorer, is in the hero, the FAQ and the footer, and the
  README lists it.
- **Community links:** X, Telegram and GitHub in the top bar, and a Community column in the footer.

### Changed

- The site serves mainnet. Every network-specific line follows the built network, the Deploy page
  adds `--network mainnet` to its commands, and the Claim page speaks of ETH only while no stock
  token is listed.
- The docs read the built network's figures; the Contracts page lists mainnet and testnet side by
  side.
- The site, the docs and the audit guide describe the audits as they are run: internal, in rounds,
  with every report published in full.

### Upgrade notes

- **Node operators** install 1.0.0 with `npm install --global @minera-gpu/miner`. On a new machine,
  run `rig init --operator 0xYourWallet --network mainnet`. A machine that already has a testnet
  node key keeps it: print its mainnet deploy code with `rig code --operator 0xYourWallet --network
  mainnet`. Deploy on the site, then start with `rig start --network mainnet --coordinator
  https://coordinator-mainnet-production.up.railway.app`; the coordinator URL is remembered per
  network.

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

[Unreleased]: https://github.com/mineragpu/minera/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mineragpu/minera/releases/tag/v1.1.0
[1.0.0]: https://github.com/mineragpu/minera/releases/tag/v1.0.0
[0.1.1]: https://github.com/mineragpu/minera/releases/tag/v0.1.1
[0.1.0]: https://github.com/mineragpu/minera/releases/tag/v0.1.0
