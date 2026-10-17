# Deploy a rig

Deploying puts a GPU on the launchpad. One transaction to the rig registry binds the node key on
your GPU machine to the wallet that operates it, and records the rig's name and pair. There is no
bond: you pay only the network fee.

The [Deploy page](/deploy) runs the flow in five steps: one command on the GPU machine, then one
transaction from your wallet. This page explains each step, and what the registry checks.

## 1. Connect your wallet

The site lists the browser wallets installed in your browser. The wallet you connect becomes the
rig's operator: it sends the deploy transaction and receives the rig's rewards.

The site asks the wallet to switch to {{network.chainName}}, and offers the network's settings
first if the wallet does not know it yet. To add the network by hand:

| Setting | Value |
|---|---|
| Network name | {{network.chainName}} |
| RPC URL | `{{network.rpc}}` |
| Chain ID | `{{network.chainId}}` |
| Currency symbol | {{network.currency}} |
| Block explorer | {{network.explorer}} |

## 2. Set up the GPU machine

The page shows one command for the GPU machine, with your wallet's address and a one-time pairing
code already in it. Run it on the machine with the GPU, your own or a rented one.

On Linux, the command downloads and runs the [rig script](where-to-run-a-rig.md#run-a-rented-machine-with-one-script).
It installs Node.js 22, a local model runtime and the node client, then pairs the machine:

```sh
curl -fsSLO https://mineragpu.tech/rig.sh && OPERATOR=0xYourWalletAddress PAIR=<code> bash rig.sh
```

On Windows or macOS, with Node.js 22, the GPU driver and a local model runtime installed (see
[Quickstart: run a node](quickstart.md)):

```sh
npm install --global {{brand.nodePackage}}
rig pair --code <code> --operator 0xYourWalletAddress{{network.rigFlag}} --start --keep-model
```

`rig pair` creates the node key when the machine has none, and sends three things to the
coordinator under the pairing code: the node address, the deploy code for your wallet, and the
card's model and memory. The node key never leaves the machine. The page asks the coordinator for
the code every few seconds, and fills in the node address and deploy code as soon as the machine
connects. The machine then waits until the rig is deployed and starts the node on its own.

Before anything is sent, the page checks the deploy code. It recovers the address that signed it
for the connected wallet, this registry and this chain, and compares it with the node address. The
coordinator makes the same check before it keeps a pairing. A code made for another wallet,
registry or network fails here, instead of in a transaction you would pay for. The page also asks
the coordinator whether the node is already deployed. Each node key deploys once.

The pairing code is 128 random bits, made in your browser and kept for the tab's session. Anyone
holding it could only read what the machine sent, none of which is secret, and a code taken by one
machine cannot be taken by another. A pairing expires after 6 hours.

### Paste by hand instead

The page also takes the node address and deploy code pasted by hand, for a machine that already
has a node key or runs an older node client:

```sh
rig code --operator 0xYourWalletAddress{{network.rigFlag}}
```

- A **node address** is `0x` followed by 40 hexadecimal characters.
- A **deploy code** is `0x` followed by 130 hexadecimal characters: a 65-byte signature.

The page takes the first `0x` value in what you paste, so a whole printed line works too.

## 3. Name the rig

The name is shown on the launchpad board and the rig page. It takes 1 to 32 bytes of UTF-8 after
surrounding spaces are removed, so a name with accented letters or other scripts fits fewer
characters. It cannot be changed after deploying.

## 4. Choose what it pairs with

Pick ETH or a listed stock token. The pair is recorded on the registry, shown on the board, and
sets the asset the Claim page defaults to. Rewards are counted in ETH either way, and you can claim
in ETH instead at any time. [Pairs and claims](pairs-and-claims.md) explains how a claim is
converted.

Tokenized stocks are not available to US persons.

## 5. Send the deploy

The summary shows the operator, the node, the name and the pair. Press the deploy button and
confirm in your wallet. The site sends one call to the rig registry:

```solidity
deploy(address nodeKey, address pair, string name, bytes authorization)
```

`authorization` is the deploy code. When the transaction lands, the page shows the rig's name and
a link to its rig page, and waits for the coordinator to index it. That takes about a minute. The
coordinator indexes registry events once they are 10 blocks deep.

A paired machine starts the node on its own once the rig is indexed, and the page shows the rig
come online. A machine set up by hand needs the start command:

```sh
rig start{{network.rigFlag}} --keep-model
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
  The site has no control for it yet. The Claim page defaults to the new pair once the coordinator
  has indexed the change.
- **Retiring the rig.** The operator wallet can call `retire(nodeKey)`. It is permanent: the rig
  leaves the board, the coordinator refuses its requests, and the node key can never be deployed
  again. Work verified before it retired is still settled, and rewards already earned stay
  claimable.
- **Changing the operator.** There is no function for it. Retire the rig, then deploy a new node
  key from the new wallet.
