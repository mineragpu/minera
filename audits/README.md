# Audits

The Minera maintainers audit the contracts themselves, in rounds, and publish every report here in
full and unedited. Each report names its scope, the exact tag it reviewed, how it was checked and
every finding with its status.

| Date | Report | Scope | Result |
|---|---|---|---|
| 2026-10-06 | [Contracts, round 1](2026-10-06-contracts-round-1.md) | `packages/contracts/src` at `v0.1.1`, as deployed on testnet | No critical or high findings; 1 medium, 2 low, 7 informational |
| 2026-10-09 | [Contracts, final round](2026-10-09-contracts-final-round.md) | `packages/contracts/src` at `2b8839a`, the code to deploy on mainnet, and the deploy script | No critical or high findings; code unchanged since round 1; 1 medium acknowledged, 2 informational |

## Follow-ups

Changes made after a report, so each report stays as it was published.

| Date | Finding | Change |
|---|---|---|
| 2026-10-06 | Round 1, L-01 | The deploy script refuses unsafe delays, release rates and missing addresses. |
| 2026-10-08 | Round 1, M-01 | The deploy script refuses a guardian that is the publisher, and a mainnet challenge delay under an hour. |
| 2026-10-09 | Round 1, M-01 and I-07 | For mainnet the owner chose a dedicated guardian key instead of a multisig; the script refuses a guardian that is the deployer or the publisher. NatSpec added (I-07). See the final round. |

## How the audits work

- **Rounds.** Round 1 covers the code running on testnet. The final round covers the exact commit to
  be deployed on mainnet and is published here before launch.
- **How a round works.** The [audit guide](../packages/contracts/AUDIT.md) sets the scope, the roles,
  the properties that must hold with the test behind each one, and the questions every round
  answers.
- **Independent review is welcome.** These audits are internal. Anyone can review the same code;
  report a vulnerability privately through
  [a security advisory](https://github.com/mineragpu/minera/security/advisories/new), as
  [SECURITY.md](../SECURITY.md) describes.
