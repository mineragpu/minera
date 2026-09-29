# FAQ

## What does it cost to deploy a rig?

Only the network fee for one transaction to the rig registry. There is no bond and no deposit.

## What will my rig earn?

No figure is promised. A rig earns a share of what the Burn Pool may release, in proportion to its
verified work against everyone else's. The home page and `GET /v1/pool` show the pool's live
figures. [Verification and rewards](verification-and-rewards.md) explains the split.

## Does the node need a GPU?

The node client runs without a detected GPU, and the GPU it reports is informational. What
matters is that the machine answers checks correctly and returns jobs before their deadlines, 120
seconds for a playground prompt. In practice that takes a GPU.

## My rig was online and did work. Why did it earn nothing?

Only verified work earns. The usual reasons:

- the answer was not cross-checked, because only a share of prompts goes to two rigs;
- the two answers did not match exactly;
- the rig failed a check and was not eligible for open jobs until it passed the next one;
- the rig does not serve the model open jobs use.

Uptime and checks earn nothing on their own.

## When can I claim?

About a minute after each epoch ends, the coordinator publishes a settlement that includes the
work verified up to then. It becomes claimable after the challenge delay,
{{testnet.challengeDelay}} on testnet. The [Claim page](/claim) shows a pending settlement and when
it becomes claimable.

## Do I have to claim after every settlement?

No. Each settlement records your total earnings to date, so you can claim once, whenever you like,
and receive everything not yet claimed.

## Can I claim in something other than my rig's pair?

In ETH, yes, at any time: the Claim page always offers it next to your pair. In a different stock
token, not from the site. The Claim page offers the pairs of your rigs and ETH, so change a rig's
pair first. See [Change a rig's pair](pairs-and-claims.md#change-a-rig-s-pair).

## Why did my stock claim fail?

The stock market may be paused, your wallet may be on the stock token's blocklist, the price may
have moved more than 1%, or the 20-minute deadline may have passed. The whole claim reverts, so
nothing is lost, and claiming in ETH still works.

## Is burned ETH destroyed?

No. "Burn" means one-way: the ETH stays in the Burn Pool until miners claim it as rewards.

## Can the project take the ETH in the Burn Pool?

The contract has no function for it: ETH leaves only through claims against published settlements.
Settlements are built by the project's coordinator, though, and the guardian key can appoint a new
publisher after a delay. [Security and trust](security.md) states exactly what that means.

## Can I run several rigs from one wallet?

Yes. Each machine runs its own node client with its own node key, and each node key is deployed as
its own rig. Their rewards add up in the wallet's one balance. The two copies of a cross-checked
prompt never go to rigs of the same wallet.

## What happens if I lose the node key?

Run `init --force` to create a new key and deploy it as a new rig. Retire the old rig from the
operator wallet. Rewards the old rig already earned stay claimable by the wallet.

## Are playground prompts private?

No. Prompts go to rigs run by independent operators, who can read them. Do not send private
information.

## Is there a token?

A token is planned, and its utility is not decided yet. Rewards today are committed in ETH, and you
claim them in ETH or in the stock token your rigs pair with.

## Is mainnet live?

No. The network runs on testnet, with test assets. Mainnet is planned.
