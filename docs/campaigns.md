# Campaigns

A campaign is an announced period of burns into the Burn Pool. {{brand.rewardAllocation}}

## Where the funds come from

- Creator fees are the fees the project earns from its own token, ${{token.symbol}}, launched on
  {{token.launchedOn}}. They are paid on mainnet, where the Burn Pool is not deployed yet.
- Until the scheduled refills start, burns come from the project wallet.
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

## Allocation

{{brand.rewardAllocation}} Each campaign is announced with its schedule before it opens.

## What a campaign does not change

- **The release limit.** Burned ETH adds to the uncommitted balance, and the release limit decides
  how fast it reaches rigs.
- **Who can burn.** Anyone can burn, and a burn can carry any campaign id. The campaign figures
  count every burn with that id, whoever sent it. The project announces its own burns; the sender
  of each one is public on the explorer.
