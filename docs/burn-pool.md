# Burn Pool

The Burn Pool is the contract that holds the ETH rewards are paid from. ETH goes in as a burn and
leaves only as a claim against a settlement. There is no withdraw function.

> [!NOTE]
> "Burn" means one-way. Burned ETH is not destroyed: it stays in the pool until miners claim it as
> rewards.

## Deposits are one-way

- `burn(campaignId, memo)` deposits the ETH sent with it and emits
  `Burned(from, amount, campaignId, memo)`. Anyone can burn. The campaign id and the 32-byte memo
  label the deposit; see [Campaigns](campaigns.md).
- Sending ETH to the contract directly counts as a burn with campaign id 0.
- A burn of zero reverts with `NothingBurned()`.
- No function moves ETH out except `claim` and `claimVia`, and both pay only against a finalized
  settlement. There is no owner, no withdraw, no sweep and no recovery function.
- The contract cannot be upgraded. It sits behind no proxy, and its parameters are fixed when it
  is deployed.

## The release limit

The pool never lets rewards run ahead of what it holds, and it releases what it holds gradually.
A settlement's total can grow by at most a fixed share of the uncommitted balance per day:

```text
uncommitted = totalBurned − committed
grow        = uncommitted × releaseBpsPerDay × elapsed ÷ (10,000 × 86,400)
releasable  = committed + min(grow, uncommitted)
```

- `committed` is the total of the head settlement, or 0 before the first.
- `releaseBpsPerDay` is {{testnet.releaseBpsPerDay}} on testnet: {{testnet.releasePercentPerDay}} of
  the uncommitted balance per day.
- `elapsed` is the seconds since the head settlement was published, or since the pool was deployed
  when there is none.
- The arithmetic is in integers, multiplied first and divided last, rounded down.

A new settlement's total must be at least `committed` and at most `releasable`, or `publish`
reverts with `TotalDecreased` or `TotalAboveRelease`.

**Example.** With 1 ETH uncommitted and one hour since the last settlement, the testnet rate lets a
new settlement add at most {{testnet.hourlyReleaseOfOneEth}} ETH.

The limit grows linearly with the time since the last settlement. If no settlement is published
for {{testnet.fullReleaseDays}} days at the testnet rate, the whole uncommitted balance becomes
releasable at once.

## Settlements and the challenge delay

- Only the publisher can publish a settlement: a non-zero Merkle root, the new total and the
  digest of its inputs.
- Only one settlement can be pending. A new one can be published only once the latest one is past
  its challenge delay, or vetoed.
- A settlement becomes claimable at its publish time plus the challenge delay,
  {{testnet.challengeDelay}} on testnet.
- Claims under a settlement can never add up past its total. A claim that would take the pool's
  total claimed above the settlement's total reverts with `AboveSettlementTotal`.
- Each account's claimed amount is recorded, so a cumulative entitlement pays out once.

## The guardian's veto

The guardian is a separate key with a narrow set of powers.

- **Veto.** It can veto a settlement while that settlement is inside its challenge delay. The head
  goes back to the previous settlement, and the vetoed total no longer counts as committed.
- **Final after the delay.** Once a settlement is claimable, nobody can veto it.
- **No path to funds.** The guardian has no function that moves ETH. Its other powers are to
  schedule and disable zaps, to propose a new publisher, and, on the rig registry, to list and
  delist pairs.

## The publisher and its rotation

The publisher is the key the coordinator publishes settlements with. Replacing it takes two
steps:

1. The guardian calls `proposePublisher(next)`. The change becomes possible after the rotation
   delay, {{testnet.rotationDelay}} on testnet. A newer proposal replaces an older one and restarts
   the delay.
2. Anyone calls `applyPublisher()` once the delay has passed.

The delay makes every change of publisher public before the new key can publish.

## Zaps

A zap converts a claim's ETH into another asset. The guardian allows a zap with `allowZap`, and it
becomes usable after the challenge delay, so every new conversion route is public before anyone can
use it. `disallowZap` takes effect at once. Only the claiming account chooses a zap, through
`claimVia`, and the pool sends the zap only that account's own claim.

## What the contract enforces

- Deposits never leave except through claims.
- Settlement totals never decrease and never exceed the release limit.
- A settlement is claimable only after its challenge delay and only if it was not vetoed.
- Claims need a valid Merkle proof and never exceed the settlement's total.
- The guardian can delay payouts by vetoing, but cannot take funds.
- Publisher changes and new zaps wait out a public delay.

## What it does not enforce

- **That a root matches real work.** The pool checks proofs against the root it was given. It
  relies on the publisher to build the root from verified work, bounded by the release limit and
  watched by the guardian during the challenge delay.
- **Who burns, and under which campaign.** Anyone can burn, with any campaign id.
- **That the guardian vetoes.** A bad settlement that nobody vetoes becomes claimable after the
  delay.

[Security and trust](security.md) covers these assumptions in full.

## Read it live

The Burn Pool section of the home page and `GET /v1/pool` show the total burned, the committed and
releasable amounts, recent burns and recent settlements, all read from the chain. The contract's
address and parameters are in [Contracts](contracts.md).
