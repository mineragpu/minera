# Security policy

Minera moves value through contracts and pays for work it cannot see being done, so security
reports get priority over every other kind of issue. This page says what is covered, how to report
a problem privately and what to expect after you do.

The published threat model, with every trust assumption and known limitation, is in
[docs/security.md](docs/security.md).

## Supported versions

| Version | Supported |
|---|---|
| Testnet deployment (chain ID 46630): the contracts listed in the [README](README.md#testnet-contracts), the coordinator at `https://api.mineragpu.tech` and the site at `https://mineragpu.tech` | Yes |
| `main` branch | Yes |
| Older commits, forks and self-hosted copies | No |

The mainnet deployment is planned. This policy will list it when it ships.

## Report a vulnerability

Report privately through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**, or go straight to
   <https://github.com/mineragpu/minera/security/advisories/new>.

Please do not open a public issue, pull request or discussion for a vulnerability, and do not share
details elsewhere until a fix is out.

### What to include

- The component affected: contract, coordinator API, node client or site.
- The commit hash, or the contract address and chain ID, you tested against.
- Steps to reproduce, with the smallest proof of concept you have: a Foundry test, a request
  sequence or a script.
- The impact as you understand it: what an attacker gains and what they need first.
- Transaction hashes, request IDs or logs, if the issue was observed on the testnet.
- Any fix or mitigation you would suggest.

A clear report with a working proof of concept is the fastest way to a fix.

## What to expect

| Step | Target |
|---|---|
| Acknowledgement of your report | Within 3 business days |
| First assessment and status update | Within 7 business days |

Once a fix ships, we publish a GitHub security advisory that describes the issue and the fix.
Reporters are credited in the advisory unless they ask not to be.

## Scope

In scope:

- **Contracts** in `packages/contracts`: the Burn Pool, the rig registry and the pair zap, as
  deployed on the testnet and as they stand on `main`.
- **Coordinator API** in `apps/coordinator`, served at `https://api.mineragpu.tech`: node
  authentication, job dispatch, verification, Sentinel, settlement building and publishing, and
  the public routes.
- **Node client** in `packages/miner`: key handling, request signing and the deploy code.
- **Site** in `apps/web`, served at `https://mineragpu.tech`: anything that could lead a user to
  sign a transaction they did not intend, or that exposes data it should not.

Out of scope:

- The monetary value of testnet assets. Testnet ETH and test tokens have no value. A bug that would
  move them without authorization is still in scope, judged by the impact it would have on
  mainnet.
- Social engineering, phishing, or physical attacks against maintainers, operators or users.
- Volumetric denial of service, load testing and traffic floods.
- Limitations already listed in [docs/security.md](docs/security.md), unless you show an impact
  the page does not describe.
- Findings from automated scanners with no demonstrated impact, and reports about missing best
  practice headers or settings that have no exploit.

## Safe harbor

We will not pursue or support legal action against research that is done in good faith and within
this policy. Good faith means that you:

- test against the testnet, and against rigs, wallets and data you own or have permission to use;
- avoid privacy violations, data destruction and service degradation, and stop as soon as you reach
  data that is not yours;
- do not exploit an issue beyond what is needed to show it exists;
- report the issue privately and give us reasonable time to fix it before any disclosure.

If you are unsure whether something is in scope or allowed, ask in a private report first.
