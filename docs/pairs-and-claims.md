# Pairs and claims

Every rig is paired with an asset: ETH, or a stock token listed on the network. Rewards are earned
in ETH, and when you claim you choose how to receive them: as ETH, or swapped into a listed stock
token on the way out.

## Listed assets on testnet

{{testnet.pairTable}}

ETH is address zero and is always a valid pair. Tokenized stocks are not available to US persons.

## How an asset gets listed

- The guardian lists an asset on the rig registry with `listPair`. It can be used only after the
  listing delay, {{testnet.listingDelay}} on testnet, so every new listing is public before anyone
  can pair with it.
- `delistPair` stops new deployments and pair changes to that asset. Rigs already paired with it
  keep it until their operator changes it.
- A claim can be converted only along a route in the pair zap. Routes are fixed when the zap is
  deployed: each asset has one native-ETH pool with a fixed fee and tick spacing, and no hooks.
  Nobody can redirect a conversion later. A new route means a new zap, and the Burn Pool accepts a
  new zap only after its challenge delay, {{testnet.challengeDelay}} on testnet.

## How rewards are counted

Rewards are counted in ETH, per operator wallet. Every rig a wallet operates adds to the same
balance, and the pair does not change how much a rig earns. The pair is recorded on the registry
and shown on the board and the rig page. It does not lock a claim to that asset: the claim page
offers ETH and every listed stock token.

## Claim your rewards

Open the [Claim page](/claim) with the operator wallet. It shows:

- **Claimable now:** everything earned up to the newest claimable settlement, less what you already
  claimed;
- **Earned in total** and **Already claimed**;
- the settlement the claim comes from, and a newer settlement still inside its challenge delay,
  with the time it becomes claimable.

Then choose how to receive the claim.

### Claim in ETH

The site calls `claim(index, account, cumulative, proof)` on the Burn Pool, and the ETH goes
straight to your wallet. Anyone may send this call for any account; the ETH always goes to the
account in the claim.

### Claim as a stock token

The site calls `claimVia(index, cumulative, proof, zap, data)`. The Burn Pool sends the ETH to the
pair zap, which swaps it and transfers the token to your wallet in the same transaction. Only the
account itself can claim through a zap, and only the account sets the terms in `data`: the asset,
the minimum output and a deadline.

## The quote and slippage

For each listed stock token, the site reads a quote for swapping your claimable ETH along the
zap's own route, from the quoter contract. It shows about how much you would receive and the
least you would accept with 1% slippage.

When you press claim, the site reads a fresh quote and sets:

- the **minimum output** to that quote less 1%;
- the **deadline** to 20 minutes after sending.

If the swap would deliver less than the minimum, or the transaction is mined after the deadline,
it reverts and nothing is claimed. If no fresh quote can be read, nothing is sent.

## When a stock claim fails

The zap checks, in this order:

| Check | Error |
|---|---|
| The asset has a route in this zap. | `UnknownPair(asset)` |
| The deadline has not passed. | `Expired(deadline)` |
| The amounts fit the swap. | `AmountTooLarge()` |
| The stock token registry is not paused. | `MarketPaused()` |
| Your wallet is not on the stock token registry's blocklist. | `RecipientBlocked(account)` |
| The swap delivers at least the minimum. | `InsufficientOutput(received, minimum)`, or an error from the swap itself |

The pool itself refuses a zap that is not allowed yet with `ZapNotAllowed(zap)`.

Any failure reverts the whole claim. Nothing is paid, nothing is marked as claimed, and the full
amount stays claimable. Claiming in ETH does not depend on the stock market, its pause or its
blocklist: it works whenever your wallet can receive ETH.

## Change a rig's pair

The operator wallet can call `setPair(nodeKey, pair)` on the rig registry. The new pair must be ETH
or a listed asset past its listing delay. The site has no control for it yet.
