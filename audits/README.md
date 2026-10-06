# Audits

The Minera maintainers audit the contracts themselves, in rounds, and publish every report here in
full and unedited. Each report names its scope, the exact tag it reviewed, how it was checked and
every finding with its status.

| Date | Report | Scope | Result |
|---|---|---|---|
| 2026-10-06 | [Contracts, round 1](2026-10-06-contracts-round-1.md) | `packages/contracts/src` at `v0.1.1`, as deployed on testnet | No critical or high findings; 1 medium, 2 low, 7 informational |

- **Rounds.** Round 1 covers the code running on testnet. The final round covers the exact commit to
  be deployed on mainnet and is published here before launch.
- **How a round works.** The [audit guide](../packages/contracts/AUDIT.md) sets the scope, the roles,
  the properties that must hold with the test behind each one, and the questions every round
  answers.
- **Independent review is welcome.** These audits are internal. Anyone can review the same code;
  report a vulnerability privately through
  [a security advisory](https://github.com/mineragpu/minera/security/advisories/new), as
  [SECURITY.md](../SECURITY.md) describes.
