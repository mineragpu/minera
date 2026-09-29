# Security and trust

This page says what the contracts enforce, what depends on people and keys, and what the network
cannot do yet. It is written to be checked: every rule here can be read in the contracts or the
coordinator's source.

## Status

- The network runs on testnet only, with test assets. Mainnet is planned.
- The contracts have not been audited.
- The contracts cannot be upgraded. A change of rules means new contracts at new addresses.

## What the contracts enforce

- Burned ETH leaves the Burn Pool only through claims against published settlements. There is no
  withdraw, sweep or recovery function, and no owner.
- A settlement's total never decreases and never exceeds the release limit:
  {{testnet.releasePercentPerDay}} of the uncommitted balance per day on testnet.
- A settlement is claimable only after its challenge delay, {{testnet.challengeDelay}} on testnet,
  and only if the guardian did not veto it.
- Claims need a valid Merkle proof, pay each cumulative amount once, and never add up past a
  settlement's total.
- A new publisher or a new zap waits out a public delay before it can act.
- A rig can be deployed only with the node key's signature for the deploying wallet, on that
  registry and chain.

[Burn Pool](burn-pool.md) explains each rule.

## Who you trust, and for what

### The coordinator

One service, run by the project, decides which answers are verified, measures work units and
builds every settlement.

- **It could get the split wrong.** The pool checks a settlement's total, not how the total is
  divided. A root could lower one wallet's total and raise another's.
- **What bounds it.** Each settlement stays within the release limit. Its inputs document and full
  tree are published, and their digest is on chain, so anyone can redo the split. The guardian can
  veto a bad settlement during its challenge delay.
- **What stays private.** The records of individual jobs and answers are not published. The
  inputs list verified units per rig, but not the jobs behind them.
- **If it stops,** no new settlements are published. The funds stay in the pool, and every
  published settlement can still be claimed directly on the contract.

### The publisher key

The coordinator publishes settlements with this key. Anyone holding it can publish roots within
the release limit. The guardian would have to veto each one during its challenge delay and rotate
the publisher, which takes {{testnet.rotationDelay}} on testnet.

### The guardian key

The guardian can veto settlements, schedule and disable zaps, propose a new publisher, and list
and delist pairs. It has no function that moves funds. On testnet the guardian is a single key
held by the project.

- **A guardian can delay payouts** by vetoing every settlement.
- **A compromised guardian key is the largest risk.** Whoever held it could appoint a new publisher
  after the rotation delay, then publish settlements paying themselves, limited only by the
  release limit. The rotation delay makes such a change public {{testnet.rotationDelay}} before it
  can act on testnet, but nothing on chain stops it.
- **A zap the guardian allows** can receive only the claims of accounts that choose it themselves.

### The chain

The contracts run on {{testnet.chainName}}, where a sequencer orders transactions. Every delay is
measured in block time. A sequencer that stalls or censors could delay claims, settlements or a
guardian's veto.

### Stock tokens and the swap route

- The stock tokens' registry can pause the market or block a wallet. Stock claims then fail and
  stay claimable; claims in ETH are unaffected.
- The price of a stock claim depends on the liquidity of its swap pool. The site sets a minimum of
  the fresh quote less 1%; with thin liquidity, a claim fails rather than filling below it.
- Tokenized stocks are not available to US persons.

### The site

The site reads the chain through your wallet and the coordinator, and uses the contract addresses
it was built with. It sends a transaction only when you press the deploy or a claim button, and
your wallet asks you to confirm each one. Compare the addresses your wallet shows with
[Contracts](contracts.md).

## Known limitations

- **Open jobs come from one place.** Today every open job is a playground prompt, and all use one
  model set by the coordinator, published as `jobs.model` by `GET /v1/network`.
- **Most work is not cross-checked.** Only a share of prompts, 20% by default, goes to two rigs.
  Answers nobody cross-checked earn nothing.
- **Comparison is exact.** Two honest rigs can produce different outputs for the same prompt, for
  example on different hardware, drivers or runtime versions. A mismatch pays neither rig and
  counts as a failed check for both.
- **Collusion is not detected.** Two operators who agree on answers in advance, or one person with
  two wallets, can pass a cross-check without running the model. Operator wallets are not tied to
  identities, and known-answer checks test only simple arithmetic.
- **Work units are estimates.** One unit per four characters of output, not a tokenizer count.
- **Reported hardware is not verified.** The GPU a node reports is informational.
- **The release limit is linear.** If no settlement is published for
  {{testnet.fullReleaseDays}} days at the testnet rate, the whole uncommitted balance can be
  committed at once.
- **Campaign ids are not reserved.** Anyone can burn under any campaign id, and the campaign
  figures count every such burn.
- **A rig's pair does not bind its claims.** Rewards are counted in ETH per operator wallet, and
  each claim chooses its own asset.
- **Playground prompts are not private.** Prompts go to rigs run by independent operators, who can
  read them.
- **The node key is stored unencrypted,** in a file only your user can read on systems that
  support it. It cannot move funds, but anyone holding it can act as your rig.

## Report a vulnerability

Report a vulnerability privately, not in a public issue. The repository README lists the address
to write to.
