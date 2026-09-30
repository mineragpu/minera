# Glossary

The site, the docs, the API and the logs use one set of words. This page defines each of them once.

## Rigs and nodes

**Rig.** A GPU registered on the rig registry and able to take work. A rig is identified by its
node address.

**Deploy.** Registering a rig: one transaction from the operator wallet to the rig registry. See
[Deploy a rig](deploy-a-rig.md).

**Node client.** The command-line program that runs on the GPU machine, holds the node key and runs
jobs on a local model runtime.

**Node key.** The key the node client creates once per rig. It signs every request to the
coordinator and the deploy code. It cannot move funds.

**Node address.** The address of the node key: the rig's identity on the registry, the board and
the API.

**Deploy code.** The node key's signature that lets one wallet deploy that node key, on one
registry, on one chain. It is not a secret.

**Operator.** The wallet that deployed a rig. It is the only wallet that can change the rig's pair
or retire it, and it receives the rig's rewards.

**Pair.** The asset recorded for a rig: ETH, or a listed stock token. The Claim page defaults to
it, and ETH is always available instead. The contracts do not enforce it. See
[Pairs and claims](pairs-and-claims.md).

**Retire.** Taking a rig off the network for good. A retired rig takes no work, and its node key
cannot be deployed again.

**Launchpad board.** The list of deployed rigs on the site, with each rig's pair, state and verified
work.

**Model runtime.** A local server compatible with the `/api/chat` interface that runs the models.
The node client sends it the prompts of the jobs it is assigned.

## Work

**Coordinator.** The service that assigns jobs, checks and measures results, and builds
settlements. See [Coordinator API](api.md).

**Hello.** The first signed request a node sends when it starts. The reply carries the benchmark.

**Heartbeat.** The signed request a node sends at a regular interval, 30 seconds by default. The
reply carries jobs.

**Job.** One prompt for a rig to answer: a playground prompt (`chat`), or a known-answer check
(`benchmark` or `challenge`).

**Known-answer check.** A short arithmetic question whose answer only the coordinator knows. Passing
one makes a rig eligible for open jobs. Checks earn nothing.

**Benchmark.** The known-answer check a rig receives with each hello. It must pass before the rig
receives open jobs.

**Challenge.** A known-answer check sent again at intervals, due 15 minutes after the rig's latest
challenge or hello.

**Cross-check.** Sending one prompt to two unrelated rigs, which share no operator, network or card,
and comparing their answers.

**Verified work.** An answer that matched the answer of an unrelated rig. Only verified work earns
rewards.

**Work unit.** The measure of verified work: one unit per four characters of output, rounded up,
measured by the coordinator.

**Epoch.** A fixed window in which work is counted, one hour by default.

**Sentinel.** The part of the coordinator that keeps bots, scripts, fake GPUs and sybil rigs from
earning, through five gates: identity, proof of GPU, canaries, cross-check and reputation. See
[Sentinel](sentinel.md).

**Canary.** A known-answer check that travels as an ordinary chat job. Its answer is one that
unrelated rigs agreed on for a seed prompt. It pays nothing.

**Seed prompt.** A prompt Sentinel writes in the style visitors use, to grow its bank of canaries.
It pays nothing.

**Tiebreak.** A third answer to a prompt two rigs disagreed on, from a rig unrelated to both.

**Strike.** A mark against a rig: a wrong answer to a confirmed canary, a missed canary, the losing
side of a tiebreak, or a job held past its deadline while online.

**Standing.** A rig's place in Sentinel's reputation gate: probation, trusted or quarantined.
Probation pays half for verified work, trusted pays in full, and a quarantined rig gets no work and
earns nothing for that epoch.

**Playground.** The page where anyone can send a prompt to the network. Its prompts are the open
jobs rigs take.

## Pool and rewards

**Burn.** A one-way deposit into the Burn Pool. Burned ETH is not destroyed: it stays in the pool
until it is claimed as rewards.

**Burn Pool.** The contract that holds the ETH rewards are paid from. It has no withdraw function.
See [Burn Pool](burn-pool.md).

**Campaign.** An announced period of burns into the pool, recorded on chain by its campaign id. See
[Campaigns](campaigns.md).

**Settlement.** A published Merkle root of every operator wallet's cumulative earnings, with the new
total and the digest of its inputs.

**Block.** The site's name for one settlement round, as in "the pool pays each block". It is not a
block of the chain.

**Committed.** The total of the latest settlement that was not vetoed: what the pool has promised
so far.

**Uncommitted.** Everything burned minus what is committed.

**Release limit.** The most a new settlement may commit, growing by a fixed share of the
uncommitted balance per day.

**Challenge delay.** The wait between publishing a settlement and being able to claim from it.
During it, the guardian can veto the settlement.

**Cumulative entitlement.** A wallet's total earnings to date, as a settlement records it. A claim
pays the difference between it and what the wallet already claimed.

**Claim.** Taking your unclaimed rewards from the Burn Pool, in ETH or through the pair zap.

**Pair zap.** The contract that swaps a claim's ETH into a listed stock token and delivers it.

**Slippage.** How far below the quote a stock claim may fill. The site allows 1%.

## Keys and roles

**Guardian.** The key that can veto settlements, schedule and disable zaps, propose a new publisher,
and list and delist pairs. It cannot move funds.

**Publisher.** The key the coordinator publishes settlements with. Replacing it takes a public delay.

**Listing delay.** The wait between listing a pair and being able to use it.

**Rotation delay.** The wait between proposing a new publisher and the change taking effect.

**Back.** Bonding tokens behind a rig. Planned.
