# Overview

{{brand.name}} is a GPU launchpad for mining. You deploy a GPU as a rig, pair its rewards with ETH
or a listed stock token, and the rig earns by answering real inference jobs that the network
checks. Rewards come from the Burn Pool, a contract with no withdraw function.

These docs describe the network as it runs on {{testnet.chainName}} (chain ID
{{testnet.chainId}}). Everything on testnet uses test assets. Mainnet is planned.

## What runs today

| Part | What it does | Status |
|---|---|---|
| Node client | Holds the rig's node key and runs jobs on a local model runtime | Live on testnet |
| Rig registry | Records each rig, the wallet that operates it and its pair | Live on testnet |
| Coordinator | Hands out jobs, checks results, measures verified work and publishes settlements | Live on testnet |
| Burn Pool | Holds the ETH that pays rewards and releases it only through claims | Live on testnet |
| Pair zap | Swaps a claim's ETH into a listed stock token | Live on testnet |
| Site | Deploy flow, launchpad board, rig pages, playground, claims and these docs | Live on testnet |
| Token | The project's own token. Its utility is not decided yet | Planned |
| Rig backing | Bonding tokens behind a rig | Planned |
| Mainnet | The contracts on mainnet, the first burn and real rewards | Planned |

## How it works

1. **Deploy.** The node client creates a node key on the GPU machine. Your wallet sends one
   transaction to the rig registry that binds the node key to your wallet and records the pair.
2. **Work.** The node says hello to the coordinator, passes a known-answer check, then takes jobs.
   Some prompts go to two rigs run by different operators, and matching answers count as verified
   work.
3. **Settle.** After each epoch, the coordinator splits what the Burn Pool may release across
   operator wallets by verified work, and publishes a Merkle root of everyone's cumulative
   earnings. The root becomes claimable after a challenge delay.
4. **Claim.** Your wallet claims from the Burn Pool. ETH is paid directly. A stock token is bought
   with the ETH on the way out.

## The parts

### Node client

A command-line program that runs on the GPU machine. It holds the node key, prints the deploy code
that lets your wallet deploy the rig, and runs the jobs the coordinator assigns on a local model
runtime. It signs every request with the node key. See
[Quickstart: run a node](quickstart.md).

### Coordinator

The service that assigns jobs, compares answers, measures work and builds settlements. It serves
a public read API that the site uses. Nodes are not trusted about their own work: every value that
decides payment is measured by the coordinator. See [Coordinator API](api.md) and
[Verification and rewards](verification-and-rewards.md).

### Contracts

- **Burn Pool.** Takes one-way deposits and pays claims against settlements, within a release
  limit. See [Burn Pool](burn-pool.md).
- **Rig registry.** The launchpad on chain: each rig's node key, operator wallet, pair and deploy
  time.
- **Pair zap.** Converts a claim from ETH into a listed stock token and delivers it.

Addresses, parameters and every function are listed in [Contracts](contracts.md).

### Site

The site reads the chain and the coordinator. It sends a transaction only from your connected
wallet, when you press the deploy button or a claim button, and your wallet asks you to confirm
each one.

## Where to start

- **You have a GPU.** Read [Quickstart: run a node](quickstart.md), then
  [Deploy a rig](deploy-a-rig.md).
- **You want to see the network work.** Send a prompt from the [playground](/playground).
- **You want to check the rules.** Read [Burn Pool](burn-pool.md),
  [Verification and rewards](verification-and-rewards.md) and
  [Security and trust](security.md).
