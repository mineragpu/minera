# Campaigns

A campaign is an announced period of burns into the Burn Pool. {{brand.rewardAllocation}}

## Where the funds come from

- Creator fees are the fees the project earns from its own token, ${{token.symbol}}, launched on
  {{token.launchedOn}}. They are paid on mainnet, where the Burn Pool is not deployed yet.
- Since October 17, 2026, a dedicated refill wallet tops the mainnet Burn Pool up every day, as
  campaign 2. Before that, burns came from the project wallet.
- Whatever the source, burned ETH can leave the pool only as mining rewards. See
  [Burn Pool](burn-pool.md).

## How a campaign appears on chain

- Every burn carries a campaign id and a 32-byte memo, recorded in the pool's
  `Burned(from, amount, campaignId, memo)` event.
- Campaign id 0 means no campaign. ETH sent to the pool directly is a burn with campaign id 0.
- The coordinator reports the current campaign: the campaign of the most recent burn with a
  non-zero id, with the total burned under that id, the number of burns, the first and last burn
  times, and the memo as text when it is printable. `GET /v1/network` and `GET /v1/pool` both
  include it.

## Campaign 1

Campaign 1 opened on mainnet with the first burn into the mainnet Burn Pool: 0.001 ETH from the
project wallet on October 9, 2026, with the memo "mainnet genesis". On testnet, campaign 1 was the
first burn into the testnet Burn Pool, in test ETH. The figures of the network the site runs on are
read live on the home page and from the API.

## Campaign 2: daily refills

Campaign 2 opened on mainnet on October 17, 2026, with the first daily refill. Each refill is a
burn from the refill wallet, [`0xBe772A628aA04559A26F2Bb0fC6f5371c3239EdE`](https://robinhoodchain.blockscout.com/address/0xBe772A628aA04559A26F2Bb0fC6f5371c3239EdE), under
campaign id 2 with the memo "daily refill". Campaign 2 runs on mainnet only.

The refill wallet is a separate wallet with one job: topping up the pool.

- **It keeps the project wallet's key out of daily use.** The refill wallet holds only what the next
  refills need, and the project wallet tops it up from time to time.
- **It has no role in the contracts.** It cannot veto, publish or list anything. Like every burn, a
  refill only adds to the pool and cannot be taken back out.
- **Every refill is public.** It is listed under Top-ups on the [Rewards page](/rewards) with its
  transaction, and on the explorer under the refill wallet's address.

Daily refills keep the uncommitted balance from running low. They do not change the release limit,
which still decides how much of the pool reaches rigs each day.

## Allocation

{{brand.rewardAllocation}} Each campaign is announced with its schedule before it opens.

## What a campaign does not change

- **The release limit.** Burned ETH adds to the uncommitted balance, and the release limit decides
  how fast it reaches rigs.
- **Who can burn.** Anyone can burn, and a burn can carry any campaign id. The campaign figures
  count every burn with that id, whoever sent it. The project announces its own burns; the sender
  of each one is public on the explorer.
