## Summary

<!-- What changes, and why. Link the issue it closes, for example "Closes #12". -->

## How it was tested

<!-- Commands run, new tests added, and anything checked by hand. -->

## Checks

- [ ] `npm run typecheck` passes
- [ ] `npm test -w @minera/shared -w @minera/coordinator -w @minera/miner` passes
- [ ] `npm run build -w @minera/web` passes
- [ ] `forge build`, `forge test` and `forge fmt --check` pass in `packages/contracts` (contract changes only)
- [ ] New behavior has tests, and a fix has a test that fails without it

## Security impact

<!--
Does this change who can move funds, roles or delays in the contracts, how nodes authenticate,
what the coordinator verifies or pays for, or what the site asks a wallet to sign?
Describe the effect, or write "None".
-->

- [ ] No secrets, private keys, node keys or `.env` files are included

## Docs

- [ ] `docs/` and the READMEs are updated, or no update is needed
