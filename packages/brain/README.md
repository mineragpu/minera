# Minera Brain

`minera-brain` drafts a report about the Minera network: the day's figures, ready-to-edit posts for X
and Telegram, and, when asked, one sentence the network writes itself.

**Status:** version 0.x, built in this repository; it is not on npm yet.

## How it works

1. **The figures come from code.** Brain reads the coordinator's public API (`GET /v1/network` and
   `GET /v1/rigs`) and formats every number itself. The network never writes a figure.
2. **The sentence comes from the network.** With `--ask`, Brain sends one verified prompt to the
   playground, so two unrelated rigs answer it with the open model the network serves and their
   answers are compared. The sentence is kept only when the two agreed (`verified`) and it passes a
   guard: one line, no figures, no links, no price talk and nothing that reads as a promise. Otherwise
   the draft says why it was left out and names the job.
3. **A person decides.** Brain writes a draft and stops there. It holds no key, posts nothing and
   marks a quiet day (no rig online and no verified work) as one to hold.

## Run it

From a clone, with Node.js 22 or later:

```sh
npm ci
node packages/brain/src/cli.ts report                       # mainnet, figures only
node packages/brain/src/cli.ts report --network testnet
node packages/brain/src/cli.ts report --ask --out draft.md  # also ask the network for its sentence
```

`--ask` creates one playground job, counted against the playground's limit of 5 prompts a minute, and
waits up to two minutes for both rigs. The prompt holds only public figures.

## The draft

- **X:** the date, rigs online, verified work in the last 24 hours and ETH burned into the Burn Pool,
  then the sentence if it fits, then the site. It stays within 280 characters as X counts them (a
  link counts as 23); a sentence that would go past is left out of X and kept for Telegram.
- **Telegram:** the same figures, one per line, with the answers served, the epoch and the rigs with
  the most verified work this epoch.
- **The network's sentence:** kept with its job id, or the reason it was left out.
- **Figures:** the raw values, in wei and units, to check the posts against.

## Tests

```sh
npm test --workspace @minera-gpu/brain
```

The tests run against a fake coordinator: the figures and their formatting, the 280-character limit,
the guard, and that an answer is kept only when it was verified.
