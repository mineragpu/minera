# Deploy a rig

Deploying puts a GPU on the launchpad. One transaction to the rig registry binds the node key on
your GPU machine to the wallet that operates it, and records the rig's name and pair. There is no
bond: you pay only the network fee.

The [Deploy page](/deploy) runs the flow in six steps. This page explains each one, and what the
registry checks.

## 1. Connect your wallet

The site lists the browser wallets installed in your browser. The wallet you connect becomes the
rig's operator: it sends the deploy transaction and receives the rig's rewards.

The site asks the wallet to switch to {{testnet.chainName}}, and offers the network's settings
first if the wallet does not know it yet. To add the network by hand:

| Setting | Value |
|---|---|
| Network name | {{testnet.chainName}} |
| RPC URL | `{{testnet.rpc}}` |
| Chain ID | `{{testnet.chainId}}` |
| Currency symbol | {{testnet.currency}} |
| Block explorer | {{testnet.explorer}} |

## 2. Install and run the node client

On the GPU machine, install the node client and create the node key, passing the operator
wallet's address. Once your wallet is connected, the page fills its address into the commands.

```sh
node packages/miner/src/cli.ts init --operator 0xYourWalletAddress
```

[Quickstart: run a node](quickstart.md) covers the requirements and the install. If the machine
already has a node key, print its deploy code for this wallet instead:

```sh
node packages/miner/src/cli.ts code --operator 0xYourWalletAddress
```

## 3. Paste the node address and the deploy code

Copy both values from the node client's output. The page takes the first `0x` value in what you
paste, so a whole printed line works too.

- A **node address** is `0x` followed by 40 hexadecimal characters.
- A **deploy code** is `0x` followed by 130 hexadecimal characters: a 65-byte signature.

Before anything is sent, the page checks the code. It recovers the address that signed it for the
connected wallet, this registry and this chain, and compares it with the node address. A code
made for another wallet, registry or network fails here, instead of in a transaction you would pay
for. The page also asks the coordinator whether the node is already deployed. Each node key
deploys once.

## 4. Name the rig

The name is shown on the launchpad board and the rig page. It takes 1 to 32 bytes of UTF-8 after
surrounding spaces are removed, so a name with accented letters or other scripts fits fewer
characters. It cannot be changed after deploying.

## 5. Choose what it pairs with

Pick ETH or a listed stock token. The pair is recorded on the registry and shown on the board.
[Pairs and claims](pairs-and-claims.md) explains how rewards are paid in each asset.

Tokenized stocks are not available to US persons.

## 6. Send the deploy

The summary shows the operator, the node, the name and the pair. Press the deploy button and
confirm in your wallet. The site sends one call to the rig registry:

```solidity
deploy(address nodeKey, address pair, string name, bytes authorization)
```

`authorization` is the deploy code. When the transaction lands, the page shows the rig's name and
a link to its rig page, and waits for the coordinator to index it. That takes about a minute: the
coordinator reads registry events 10 blocks behind the chain head.

Then start the node on the GPU machine, from the repository root:

```sh
node packages/miner/src/cli.ts start --coordinator {{coordinator.url}}
```

## What the registry checks

The deploy reverts, and nothing is recorded, when any check fails:

| Check | Error |
|---|---|
| The node key is not deployed yet. | `AlreadyDeployed(nodeKey)` |
| The name is 1 to 32 bytes. | `InvalidName()` |
| The pair is ETH, or an asset whose listing delay has passed. | `PairNotListed(asset)` |
| The deploy code was signed by the node key for the sending wallet, this registry and this chain. | `InvalidAuthorization()` |

The deploy code is the node key's EIP-191 signature over
`keccak256(abi.encode("rig-deploy-v1", chainId, registry, operator))`. It authorizes one wallet
only, so a copied code is useless to anyone else.

## After deploying

- **The rig page** shows the rig's state, its verified work per hour over the last 24 hours and
  its check record. The address is `/rig/` followed by the node address.
- **Changing the pair.** The operator wallet can call `setPair(nodeKey, pair)` on the registry.
  The site has no control for it yet.
- **Retiring the rig.** The operator wallet can call `retire(nodeKey)`. It is permanent: the rig
  leaves the board, the coordinator refuses its requests, and the node key can never be deployed
  again. Work verified before it retired is still settled, and rewards already earned stay
  claimable.
- **Changing the operator.** There is no function for it. Retire the rig, then deploy a new node
  key from the new wallet.
