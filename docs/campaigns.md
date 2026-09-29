# Campaigns

A campaign is an announced period with its own share of creator fees that goes into the Burn Pool.
Each campaign announces the share that is burned into the pool, and when.

## Where the funds come from

- The share is a share of creator fees, the fees the project earns from its own token. The token
  is planned, so there are no creator fees yet.
- Until then, burns come from the project wallet.
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

## Testnet campaign 1

Campaign 1 exists on testnet: the first burn into the testnet Burn Pool carried campaign id 1. Its
figures are read live on the home page and from the API, in test ETH.

## Shares

The share is announced per campaign. The share for the first mainnet campaign is not decided yet;
mainnet is planned. Where the home page shows a campaign share that is not decided, it marks the
figure as preview data.

## What a campaign does not change

- **The release limit.** Burned ETH adds to the uncommitted balance, and the release limit decides
  how fast it reaches rigs.
- **Who can burn.** Anyone can burn, and a burn can carry any campaign id. The campaign figures
  count every burn with that id, whoever sent it. The project announces its own burns; the sender
  of each one is public on the explorer.
