# Contributing

Thanks for taking the time to improve Minera. This guide covers the setup, the checks every change
must pass and how to send it.

Found a vulnerability? Do not open an issue or pull request. Follow [SECURITY.md](SECURITY.md)
instead.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 24, as pinned in [`.nvmrc`](.nvmrc) | Every TypeScript workspace. Node runs the sources directly, with no build step for the coordinator, node client or shared package |
| npm | The version bundled with Node 24 | Installing the workspaces from `package-lock.json` |
| Foundry | 1.8.3, the version CI uses | Building and testing `packages/contracts` |
| Postgres | 17 in CI; optional locally | Running the coordinator's store tests against a real database |

## Layout

The repository is one npm workspace:

| Workspace | Package | What it is |
|---|---|---|
| `apps/web` | `@minera/web` | The site: launchpad, deploy, claim, docs |
| `apps/coordinator` | `@minera/coordinator` | The API: node authentication, jobs, verification, settlement |
| `packages/miner` | `@minera/miner` | The node client, `rig` |
| `packages/shared` | `@minera/shared` | Types, chain config and settlement math shared by the others |
| `packages/contracts` | `@minera/contracts` | The Solidity contracts, built with Foundry |

`docs/*.md` holds the public documentation. The site renders it at build time.

## Setup

```sh
git clone https://github.com/mineragpu/minera.git
cd minera
npm ci
```

For the contracts, install their pinned dependencies once:

```sh
cd packages/contracts
forge soldeer install
```

## Checks

Every pull request must pass these. CI runs the same commands.

### TypeScript workspaces

```sh
# Type-check every workspace
npm run typecheck

# Unit and integration tests
npm test -w @minera/shared -w @minera/coordinator -w @minera/miner

# Production build of the site
npm run build -w @minera/web
```

`npm test` and `npm run build` with no workspace flag also run `forge test` and `forge build` in
`packages/contracts`, so they need Foundry on your `PATH`.

To run one workspace, pass its name, for example `npm test -w @minera/coordinator`.

### Coordinator store tests on Postgres

The store tests always run against the in-memory store. Set `TEST_DATABASE_URL` to also run the
same suite against Postgres. Each run creates a throwaway schema and drops it at the end.

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test -w @minera/coordinator
```

### Contracts

From `packages/contracts`:

```sh
forge build
forge test
forge fmt --check
```

The fork tests in `test/PairZap.fork.t.sol` run against the live testnet only when
`TESTNET_RPC_URL` is set. Without it they are skipped.

### Docs

The site build checks the prose in `docs/*.md` and fails on em dashes, exclamation marks, emoji
and a short list of banned marketing words. Run `npm run build -w @minera/web` after editing docs.

## Running locally

```sh
npm run dev -w @minera/web
DATABASE_URL=postgres://... npm start -w @minera/coordinator
```

The site reads `VITE_NETWORK` and `VITE_API_BASE`; copy `apps/web/.env.example` to
`apps/web/.env` to set them. The coordinator's settings and their defaults are in `apps/coordinator/src/config.ts`. Without
`PUBLISHER_PRIVATE_KEY`, settlement runs in dry mode and never publishes.

## Commits

Commit messages use the conventional commit format:

```
<type>(<scope>): <summary>
```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore`.
- **Scopes:** the workspace or area touched, such as `web`, `coordinator`, `miner`, `shared`,
  `contracts`, `docs` or `ci`. Leave it out when a change spans several.
- **Summary:** imperative mood, lower case, no trailing period, under 72 characters.
- **Body:** say why the change is needed, wrapped at about 72 characters.

Keep each commit to one logical change, and make sure every commit passes the checks on its own.

**Sign your commits.** The `main` branch accepts only signed commits. Sign with an SSH or GPG key
that is registered on your GitHub account as a signing key, so that GitHub shows each commit as
Verified. With an SSH key, for example:

```sh
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
git config commit.gpgsign true
```

## Testing policy

Tests are part of every change, not a follow-up:

- **New functionality comes with tests** in the automated suite of the workspace it touches: unit
  and integration tests with `node --test`, property tests with fast-check for logic that handles
  money, identities or untrusted input, and Foundry tests for contracts.
- **A fix comes with a test that fails without it.**
- **Security rules are tested, not only documented.** Input validation, query safety and every
  Sentinel gate have tests that would fail if the rule were removed.
- **Store changes are tested on both stores,** in memory and in Postgres.

Reviewers do not merge a change that lowers this bar, and CI runs every suite on every push and
pull request.

## Pull requests

Before you open one:

- [ ] Typecheck, tests and build pass locally.
- [ ] New behavior has tests, and a fix comes with a test that fails without it.
- [ ] No secrets, private keys, `.env` files or personal data are included.
- [ ] Docs in `docs/` and the READMEs are updated when behavior, routes or parameters change.
- [ ] Contract changes explain their effect on funds, roles and delays.

Keep pull requests focused. A reviewer should be able to read the whole diff in one sitting.
Describe what changed, why, and how you tested it. The pull request template lists the rest.

## Reporting bugs and proposing features

Use the issue forms: **Bug report** for something broken, **Feature request** for something new.
Search the open issues first, and include versions, steps and logs so the report can be reproduced.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License, Version 2.0](LICENSE).
