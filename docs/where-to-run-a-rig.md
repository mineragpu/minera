# Where to run a rig

A rig is any machine with a GPU that runs the node client. You bring the GPU: your own, or one you
rent by the hour or the month. The network does not care which, because Sentinel measures what the
machine actually does instead of trusting what it reports.

## What a rig needs

- **A GPU that holds the speed floor.** Every open job uses one small open model, published by
  [`GET /v1/network`](api.md#get-v1-network) as `jobs.model`, and a rig must answer at the speed
  published there as `jobs.minUnitsPerSecond` (40 units a second today) to keep taking open work.
  Any recent card with 4 GB of memory or more clears that comfortably.
- **A local model runtime** compatible with the `/api/chat` interface, on the same machine.
- **Node.js 22 or later.**
- **Outbound HTTPS only.** A rig opens no port and needs no public address.
- **A synchronized clock**, and somewhere safe to keep the node key.

## Your options

| Option | Good for | What it costs | How to start |
|---|---|---|---|
| **Your own PC** with an NVIDIA or AMD card, on Windows or Linux | Anyone with a gaming or work GPU | Electricity | [Quickstart](quickstart.md) |
| **A Mac with Apple silicon** | Mac owners; the runtime uses the built-in GPU | Electricity | [Quickstart](quickstart.md); the speed floor decides |
| **A GPU marketplace**, by the hour | The lowest price; small cards are enough | From a few cents an hour | [The rig script](#run-a-rented-machine-with-one-script) |
| **A GPU cloud pod** with a persistent volume | Steadier hosts with a web terminal | Tens of cents an hour | [The rig script](#run-a-rented-machine-with-one-script) |
| **A GPU virtual machine** from a large cloud | The most reliable uptime | The highest hourly price | [The rig script](#run-a-rented-machine-with-one-script) |
| **A dedicated GPU server**, by the month | A rig that never stops | A fixed monthly price | [The rig script](#run-a-rented-machine-with-one-script) |

You can also run part time: start the rig when you want and stop it when you do not. The node key
keeps its identity and its standing, so a rig that comes back is the same rig.

## Choosing a rented machine

- **On demand, not interruptible.** An interruptible machine is cheaper, but the host can pause it,
  and a paused rig takes no work.
- **A persistent volume**, so the node key survives a restart. Without it, a lost key means
  deploying a new rig.
- **An Ubuntu image with the GPU driver installed.** Rental images that come ready for machine
  learning have it.
- **4 GB of GPU memory or more.** A bigger card earns nothing extra on today's small model.

Renting costs money whether or not the rig earns. Rewards depend on verified work and on what the
Burn Pool releases, so check the [Rewards page](/rewards) for what rigs earn today before you rent.

## Run a rented machine with one script

The rig script sets up a Linux GPU machine from scratch. It installs Node.js 22, checked against its
published SHA-256, a local model runtime and the node client {{brand.nodePackage}}, pinned to a
release. Then it creates the node key and starts the node. It is part of this repository, in
`apps/web/public/rig.sh`, and is served at [mineragpu.tech/rig.sh](/rig.sh). Read it before you
run it.

1. Rent a GPU machine with an Ubuntu image, and open its terminal.
2. Download the script and run it with your operator wallet's address:

   ```sh
   curl -fsSLO https://mineragpu.tech/rig.sh
   OPERATOR=0xYourWalletAddress bash rig.sh
   ```

   The first run prints the node address and the deploy code.
3. Deploy the rig on the [Deploy page](/deploy) from that wallet. [Deploy a rig](deploy-a-rig.md)
   walks through it.
4. Run the script again. The node starts in the background, keeps the network's model installed and
   writes its log to `rig.log` in its workspace. To have it claim for you, add
   `AUTO_CLAIM=0.001` (any amount of ETH) in front of the command.
5. Find your rig on the [launchpad](/launchpad), and what it earns on the [Rewards page](/rewards).

The script uses `/workspace` when the machine has it, which is the volume most rental hosts keep
across restarts, and `~/minera` otherwise. Set `NETWORK=testnet` to run on the testnet instead.

## Keep it safe

- **Never put your wallet's private key on a rented machine.** The script needs only the operator
  address. The node key is the only secret on the machine, and it cannot move funds.
- **Back up the node key** from `.config/minera/node-key.json` in the workspace.
- **Rigs in one network never verify each other.** Several rigs at one host may sit in the same
  network, so each still needs a rig elsewhere to cross-check its work. See
  [Sentinel](sentinel.md#4-cross-check).
