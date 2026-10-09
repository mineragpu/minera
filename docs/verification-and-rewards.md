# Verification and rewards

Rigs earn for verified work, and only for verified work. This page explains where jobs come from,
how the coordinator checks and measures them, and how verified work becomes a claim on the Burn
Pool.

The figures on this page are the coordinator's defaults. `GET /v1/network` reports the live epoch
length.

## Jobs

| Kind | What it is | Deadline | Earns |
|---|---|---|---|
| `chat` | A prompt sent through the [playground](/playground) | 120 seconds | Only when verified |
| `benchmark` | A known-answer check, sent with the reply to the node's hello | 300 seconds | Nothing |
| `challenge` | A known-answer check, sent again at intervals | 60 seconds | Nothing |

Every job carries deterministic settings: temperature 0, a seed and a token limit. A playground
prompt may use up to 256 tokens, and a check up to 16.

[Sentinel](sentinel.md) also sends seed prompts and canaries. Both travel as `chat` jobs with the
playground's settings, so a node cannot single them out, and both pay nothing.

The coordinator hands out jobs on heartbeats. A rig gets at most two jobs at a time, only for
models it reports, and nothing while it reports itself busy. A chat job that is not returned by
its deadline goes back to the queue, for up to three assignments in all. A playground prompt still
waiting in the queue 5 minutes after it was sent is dropped.

> [!NOTE]
> Today, open jobs come only from the playground, and all of them use one model set by the
> coordinator. A rig earns only while visitors send prompts and some of those prompts are
> cross-checked.

## Known-answer checks

A check is a short arithmetic question with one numeric answer, such as an addition, a
subtraction or a multiplication of two small numbers. The answer stays on the coordinator and is
never sent to the node, and it never equals a number in the question, so repeating the question
cannot pass. A reply passes when, after the numbers quoted from the question are set aside, at
least one number remains and every remaining number is the answer.

- **Checks gate eligibility.** A rig receives open jobs only after it passes a check since its
  latest hello. The benchmark is that first check, so every restart starts with one.
- **Checks repeat.** A challenge is due 15 minutes after the rig's latest challenge or hello.
- **A failure pauses the rig.** A failed check, a failed canary or the losing side of a tiebreak
  makes the rig ineligible for open jobs until it passes its next check.
- **Checks earn nothing.** Their answers can be computed without a GPU. The canaries Sentinel sends
  cannot, and they decide a rig's standing: see [Sentinel](sentinel.md#3-canaries).

## Cross-checking

A share of playground prompts, 20% by default, is queued twice so that two rigs answer it.

- The two copies go to **unrelated rigs**: never two rigs that share an operator wallet, a network
  or a card. A rig never holds both copies. See [Sentinel](sentinel.md#4-cross-check) for the rule.
- When both answers are in, the coordinator compares them after trimming them and collapsing each
  run of whitespace to one space.
  - **Same output:** both answers are verified, and both rigs are credited and count a passed
    check.
  - **Different output:** a third rig, unrelated to both, answers the same prompt. The two answers
    that agree are verified and credited. The rig on the losing side counts a failed check and takes
    a strike. If all three answers differ, none is credited and nobody takes a strike.
- Once the first answer is in, a second copy still in the queue waits at most 90 more seconds for
  a rig, and a tiebreak waits at most 5 minutes. If a copy is never answered, the answers already in
  are recorded as unverified.
- An answer to a prompt that was not sent twice is recorded as unverified. It earns nothing.
- The playground hides the answer until no rig still holds the prompt, so a rig holding the second
  copy cannot read the first answer and submit it as its own.

## Work units

A work unit is an estimated token, measured by the coordinator from the output it received: one
unit per four characters of the output, rounded up, after trimming and collapsing whitespace. It
is not a tokenizer count, but it is deterministic and the same for every rig and model. An output
never earns more units than its job's token limit, and outputs longer than 32,000 characters are
refused.

The token counts and duration a node reports are kept for its own logs and never used for
payment.

## Epochs

Work is counted in epochs: fixed windows, one hour long by default and aligned to the UTC clock.
Verified work is credited to the epoch in which it was verified. `GET /v1/network` reports the
current epoch, its length and when it ends.

## Settlements

About a minute after each epoch ends, the coordinator builds the next settlement from every epoch
completed since the last one.

1. **Budget.** It reads the Burn Pool at its latest block and takes what the
   [release limit](burn-pool.md#the-release-limit) allows on top of what is already committed.
2. **Split.** It divides the budget across operator wallets in proportion to their paid units:
   verified units weighed by each rig's [standing](sentinel.md#5-reputation), in full for a trusted
   rig, half on probation, and nothing for an epoch in which the rig was quarantined. Each share is
   rounded down to the wei; the remainder stays in the pool for a later settlement.
3. **Accumulate.** It adds each share to the wallet's total from the previous settlement.
4. **Publish.** It builds a Merkle tree over every wallet's cumulative total and publishes the
   root, the new total and the digest of the inputs document to the Burn Pool.

No settlement is built while the previous one is inside its challenge delay, when the budget is
zero, or when there is no paid work to settle. A published settlement becomes claimable after
the challenge delay, {{network.challengeDelay}} on {{network.label}}. During that delay the guardian can veto
it.

The site calls each settlement round a block, as in "the pool pays each block".

## Cumulative claims

Each leaf of the tree holds a wallet's total earnings to date, not its latest share. A claim pays
the difference between that total and what the wallet already claimed. Nothing is lost by
skipping settlements: claim whenever you like, from the newest claimable one.

The leaves use the format the Burn Pool verifies:

```solidity
leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulative))))
```

Pairs of nodes are hashed in sorted order.

## Check a settlement yourself

`GET /v1/settlements/:index` returns the inputs document byte for byte, its digest and the full
tree.

- `keccak256` of the UTF-8 bytes of `inputsJson` must equal the `inputs` value in the
  `SettlementPublished` event on chain.
- Rebuilding the tree from its values must give the published root.
- The inputs list the pool block and time the budget was read at, the budget, the verified and paid
  units per rig with the wallet each rig pays, each wallet's share and each wallet's cumulative
  total. You can redo the split from the paid units and compare.

The units themselves come from the coordinator's own records of jobs, answers and Sentinel
decisions, which are not published. See [Security and trust](security.md).

## What earns nothing

- Uptime, heartbeats and being online.
- Benchmarks, challenges, canaries and seed prompts.
- Answers nobody cross-checked, and answers on the losing side of a tiebreak.
- Work done in an epoch in which the rig was quarantined.
- Results for a job that was already closed or given to another rig.
- A rig that does not serve the model open jobs use.
- A retired rig.
