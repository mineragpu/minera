# Sentinel

Sentinel is the part of the coordinator that protects mining from bots, scripts, fake GPUs, sybil
rigs and collusion. Every rig meets the same five gates, in this order, before its work can earn.
Each decision a gate makes is counted, and the counts for the last 24 hours are public at
[`GET /v1/sentinel`](api.md#get-v1-sentinel).

| Gate | What it checks | What it stops |
|---|---|---|
| 1. Identity | A signed request from a deployed rig, a fresh nonce, a request budget per key | Forged or replayed requests, floods, scripts that reset their own checks |
| 2. Proof of GPU | The speed of real answers, timed by the coordinator | CPU scripts and emulators posing as GPUs |
| 3. Canaries | Known answers, sent as ordinary chat jobs | Rigs that answer without running the model |
| 4. Cross-check | Two unrelated rigs answer the same prompt, and a third breaks a tie | Rigs that copy each other, and one bad answer knocking out an honest rig |
| 5. Reputation | Standing built from each rig's record | Repeat offenders, and new rigs cashing in before they have proved anything |

## 1. Identity

Every node request is signed by the rig's node key, bound to one chain and carries a one-time
nonce. [Node protocol](node-protocol.md) describes the signature. Sentinel adds two limits:

- **A request budget.** One node key may send 60 signed requests a minute. Past that, requests are
  refused with `429 rate_limited` until the next minute.
- **A pause between hellos.** A hello hands out a fresh benchmark, so a rig must wait 60 seconds
  between hellos, or it gets `429 hello_cooldown`. Without the pause a script could reset its checks
  at will.

An accepted hello counts as a pass. A refused signature, a replayed nonce, an unknown or retired
rig, a spent budget and a hello inside the pause each count as a block.

## 2. Proof of GPU

The coordinator times every answer itself, from the moment it hands out the job to the moment the
result arrives, in [work units](verification-and-rewards.md#work-units) per second. Answers shorter
than 32 units are not timed, since fixed overheads would dominate them.

- **The floor.** `GET /v1/network` publishes the speed a rig must reach as `jobs.minUnitsPerSecond`,
  40 by default, set for the model open jobs use.
- **The best sample decides.** The coordinator keeps each rig's last 8 samples. Once there are at
  least 3, a rig whose best sample is still under the floor gets no open work. Network delay and
  queueing on the node only ever make a sample slower, which is why the best one counts.
- **The way back.** Checks and canaries keep arriving, so a rig that is really a GPU shows its speed
  again and returns to open work.
- **Hardware is never taken on trust.** The card a node reports is informational. Only measured
  answers count.

## 3. Canaries

A canary is a known-answer check that looks exactly like paid work.

- **Where canaries come from.** Sentinel writes seed prompts in the style visitors use and sends
  each one to two rigs, like a cross-checked playground prompt. Seeds pay nothing. When two
  unrelated rigs agree on an answer, or two of three after a tiebreak, that answer goes into the
  bank.
- **How they travel.** A canary goes only to rigs that never saw the prompt, as an ordinary chat job
  with the playground's system prompt, settings and deadline. A rig cannot tell a canary from paid
  work.
- **When they come.** At random intervals: about every 5 minutes on probation and every 15 minutes
  once trusted, never sooner than 1 minute or later than 60.
- **How they are judged.** An answer passes when, after trimming and collapsing whitespace, it
  starts with the same 64 characters as the agreed answer. The start of an answer cannot be produced
  without running the model, and it is where honest rigs on different cards agree most reliably.
- **Only a confirmed canary can strike.** A canary is confirmed once another rig passes it. A wrong
  answer to an unconfirmed canary only disputes it, and a canary disputed twice before anyone
  confirms it is retired. A bad entry in the bank can never strike an honest rig.
- **Silence counts.** A canary left to run out while the rig keeps sending heartbeats is a miss.

Canaries pay nothing.

## 4. Cross-check

A share of playground prompts goes to two rigs. [Verification and
rewards](verification-and-rewards.md#cross-checking) covers how answers are compared. Sentinel
decides who may answer:

- **Unrelated rigs only.** The two copies never go to rigs that share an operator wallet, a network
  or a card. Rigs on the same network are rigs in one /24 IPv4 or /48 IPv6 subnet. A card is the
  unique id its driver reports.
- **Not from home.** A playground prompt never goes to a rig on the network it was sent from, so an
  operator cannot feed prompts to their own rigs.
- **A third rig breaks a tie.** When two answers disagree, a third rig, unrelated to both, answers
  the same prompt. The two that agree are verified and credited, and the rig on the losing side
  takes a strike. When all three disagree, the likely cause is nondeterminism rather than one bad
  rig: nobody takes a strike and nobody is paid.

The coordinator keeps a rig's network as a keyed digest of its subnet, never as an address.

## 5. Reputation

| Standing | How a rig gets there | Work | Pay for verified work |
|---|---|---|---|
| Probation | A new rig, or one back from quarantine | Checks, canaries and open jobs | Half |
| Trusted | Five canaries passed with no strike in between | Checks, canaries and open jobs | In full |
| Quarantined | Three strikes within 24 hours | None | Nothing in any epoch the quarantine touches |

A strike is any of these:

- a wrong answer to a confirmed canary;
- a canary missed while the rig was online;
- the losing side of a tiebreak;
- a job held past its deadline while the rig was online.

A rig that goes offline drops its jobs without a strike. A strike on probation starts the count of
five canaries over. Quarantine lasts one hour; the rig then returns on probation.

Standing weighs pay in the settlement: the [inputs document](verification-and-rewards.md#check-a-settlement-yourself)
lists each rig's verified units and the units it is paid for.

## Live numbers

`GET /v1/sentinel` returns the decisions of each gate over the last 24 hours and the rigs by
standing:

```json
{
  "asOf": "2026-09-30T12:00:00.000Z",
  "gates": [
    { "gate": "identity", "passed": 41, "blocked": 7 },
    { "gate": "gpu", "passed": 38, "blocked": 3 },
    { "gate": "canary", "passed": 120, "blocked": 4 },
    { "gate": "crosscheck", "passed": 96, "blocked": 2 },
    { "gate": "reputation", "passed": 5, "blocked": 1 }
  ],
  "standing": { "probation": 2, "trusted": 5, "quarantined": 1 }
}
```

The figures above are an example. The home page shows the live ones.

## What Sentinel does not do yet

- **It runs in the coordinator.** The contracts do not know a rig's standing. The settlement inputs
  show verified and paid units per rig, so the weighting can be checked, but the records of
  individual strikes and quarantines are not published.
- **Networks and cards are signals, not identity.** Rigs rented in different subnets, or a node
  that reports a made-up card id, can get past the pairing rule. Canaries and tiebreaks are what
  catch such rigs.
- **Speed is measured over the network.** A slow link lowers a rig's samples. The floor is set well
  below what a GPU reaches on the network's model to leave room for it.
- **There is no stake yet.** Deploying a rig costs only gas. A bond per rig, and slashing it, would
  need new contracts and are a mainnet decision.
