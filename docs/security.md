# Security and trust

This page says what the contracts enforce, what depends on people and keys, and what the network
cannot do yet. It is written to be checked: every rule here can be read in the contracts or the
coordinator's source.

## Status

- The network runs on testnet only, with test assets. Mainnet is planned.
- An external audit of the exact commit to be deployed comes before mainnet. The
  [audit guide](https://github.com/mineragpu/minera/blob/main/packages/contracts/AUDIT.md) sets out its scope, and the contracts' tests cover every line and branch.
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

One service, run by the project, decides which answers are verified, measures work units, runs
[Sentinel](sentinel.md) and builds every settlement.

- **It could get the split wrong.** The pool checks a settlement's total, not how the total is
  divided. A root could lower one wallet's total and raise another's.
- **What bounds it.** Each settlement stays within the release limit. Its inputs document and full
  tree are published, and their digest is on chain, so anyone can redo the split. The guardian can
  veto a bad settlement during its challenge delay.
- **What stays private.** The records of individual jobs, answers, strikes and quarantines are not
  published. The inputs list verified and paid units per rig, but not the jobs behind them.
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

## How the coordinator handles input

- **Every request is validated at the boundary.** Bodies, parameters and queries are checked
  against strict schemas before anything reads them. Names and versions a node reports must be
  single tokens of the characters those values use, and no reported field may carry control
  characters.
- **Every database query is parameterized.** Queries are written as tagged templates, and each value
  travels to Postgres as a bind parameter, never as SQL text. The only raw SQL the coordinator runs
  is the migration files in the repository. A test fails the build if raw SQL or a query built from
  a string appears anywhere else, and the store tests keep injection-style text as plain data.
- **Secrets never reach the logs.** The database URL and the publisher key are held in a wrapper
  that prints as `[redacted]`, and request logs redact the signing headers.

## Known limitations

- **Open jobs come from one place.** Today every open job is a playground prompt, and all use one
  model set by the coordinator, published as `jobs.model` by `GET /v1/network`.
- **Most work is not cross-checked.** Only a share of prompts, 20% by default, goes to two rigs.
  Answers nobody cross-checked earn nothing.
- **Comparison is exact.** Two honest rigs can produce different outputs for the same prompt, for
  example on different hardware, drivers or runtime versions. A third rig breaks the tie; when all
  three differ, nobody is paid and nobody takes a strike.
- **Collusion is harder, not impossible.** [Sentinel](sentinel.md) never pairs rigs that share an
  operator, a network or a card, catches rigs that answer without the model with canaries, and
  settles disagreements with a third rig. Operators who rent rigs in different networks and agree on
  answers in advance can still pass a cross-check between them; canaries and tiebreaks are what
  catch them over time. Operator wallets are not tied to identities, and there is no stake yet.
- **Work units are estimates.** One unit per four characters of output, not a tokenizer count.
- **Reported hardware is not trusted.** The GPU a node reports is informational. Sentinel times
  answers instead, and card ids only keep rigs apart.
- **The release limit is linear.** If no settlement is published for
  {{testnet.fullReleaseDays}} days at the testnet rate, the whole uncommitted balance can be
  committed at once.
- **Campaign ids are not reserved.** Anyone can burn under any campaign id, and the campaign
  figures count every such burn.
- **A rig's pair is a default, not a rule.** Rewards are counted in ETH per operator wallet. The
  Claim page defaults to the pair of the wallet's rigs and always offers ETH, but the contracts do
  not enforce the pair: the account can call `claimVia` with any asset the pair zap routes.
- **Playground prompts are not private.** Prompts go to rigs run by independent operators, who can
  read them.
- **The node key is stored unencrypted,** in a file only your user can read on systems that
  support it. It cannot move funds, but anyone holding it can act as your rig.

## Report a vulnerability

Report a vulnerability privately, not in a public issue: open a private report on the
repository's security page. The [security policy](https://github.com/mineragpu/minera/security/policy)
says what to include and what to expect.
