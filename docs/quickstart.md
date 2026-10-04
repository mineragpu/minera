# Quickstart: run a node

This page takes a GPU machine to a rig that takes jobs on testnet: install the node client, create
the node key, deploy the rig from your wallet, then start the node.

## Requirements

- **A GPU with enough memory for the models you serve.** The node reads the GPU model, memory and
  driver version from the GPU driver's command-line management tool when it is on your `PATH`.
  Without it, the node reports no GPU and still runs. The reported GPU is informational.
- **A local model runtime** compatible with the `/api/chat` interface, running on this machine
  (`http://127.0.0.1:11434` by default), with at least one model downloaded. The node client never
  downloads models itself.
- **Node.js 22 or later**, with npm.
- **A browser wallet on {{testnet.chainName}}** with a little test ETH for the network fee. This
  wallet becomes the rig's operator: it deploys the rig and receives its rewards.
- **A synchronized system clock.** The coordinator rejects requests stamped more than
  {{protocol.skewSeconds}} seconds away from its own time.

> [!IMPORTANT]
> Every open job currently uses one model, set by the coordinator and published by
> [`GET /v1/network`](api.md#get-v1-network) as `jobs.model`. Load that model into your runtime
> before you start. A rig that does not serve it passes its checks but receives no open jobs, so it
> earns nothing.

## 1. Install the node client

```sh
npm install --global {{brand.nodePackage}}
```

This installs the `rig` command. `rig help` lists the commands and options, and `rig --version`
prints the installed version. To run from source instead, clone {{brand.repository}}, run `npm ci`
with Node.js 22.18 or later, and use `node packages/miner/src/cli.ts` wherever this page writes `rig`.

## 2. Create the node key

Pass the address of the wallet that will operate the rig:

```sh
rig init --operator 0xYourWalletAddress
```

`init` creates the node key, stores it in the node's folder and prints three things:

- the **node address**, the rig's identity on the network;
- the network and the rig registry it deploys to;
- the **deploy code**, the node key's signature that lets this one wallet deploy this node key, on
  this registry, on this chain.

The deploy code cannot move funds and is not a secret. To print it again, for the same or another
wallet, run `code`:

```sh
rig code --operator 0xYourWalletAddress
```

`init` targets testnet by default. Mainnet is planned; until its registry is deployed,
`--network mainnet` reports that there is nothing to deploy to.

## 3. Deploy the rig

Open the [Deploy page](/deploy), connect the operator wallet, paste the node address and the deploy
code, name the rig, choose its pair and send one transaction. [Deploy a rig](deploy-a-rig.md) walks
through each step.

## 4. Check the machine

```sh
rig status
```

`status` prints the node address, the network, the config folder, the detected GPU, the runtime
version, the installed models and the saved coordinator URL. It contacts only the local model
runtime.

## 5. Start the node

```sh
rig start --coordinator {{coordinator.url}}
```

The coordinator URL must use https unless it points at this machine. It is remembered per
network, so later runs need only `start`.

Once started, the node:

1. says hello to the coordinator with its GPU, runtime version and model list;
2. runs the benchmark it receives, a known-answer check it must pass before it gets open jobs;
3. sends a heartbeat every 30 seconds by default (the coordinator sets the interval) and runs the
   jobs each heartbeat carries.

If the coordinator cannot be reached, the node retries with a delay that doubles up to 60 seconds.

### Options

| Option | Commands | Meaning |
|---|---|---|
| `--operator <wallet>` | `init`, `code` | The wallet that deploys and operates the rig. Required. |
| `--network <testnet\|mainnet>` | all | The network to use. Defaults to the one chosen at `init`. |
| `--force` | `init` | Replace an existing node key. |
| `--coordinator <url>` | `start` | The coordinator URL, remembered per network. |
| `--runtime-url <url>` | `status`, `start` | The model runtime. Defaults to `http://127.0.0.1:11434`. |
| `--concurrency <1-4>` | `start` | How many jobs run at once. Defaults to 1. |
| `--quiet`, `-q` | all | Print only results, warnings and errors. |
| `--json` | all | Print one JSON object per line. |

The coordinator assigns a rig at most two jobs at a time, so a concurrency above 2 adds nothing
today.

## Stop the node

- **Ctrl+C, or SIGTERM from a service manager:** the node stops taking jobs, lets a running job
  finish and upload its result, then exits.
- **Ctrl+C a second time:** the node exits at once. The running job is abandoned, and the
  coordinator gives it to another rig after its deadline.
- Jobs still queued when the node stops are left for the coordinator to reassign.
- To take the rig off the network for good, retire it from the operator wallet. See
  [Deploy a rig](deploy-a-rig.md#after-deploying).

## What leaves this machine

To the coordinator at the URL you pass, and nowhere else:

- **Hello:** the client and protocol versions, the GPU model, memory and driver version, and the
  runtime version and installed model list.
- **Every heartbeat:** whether the node is busy, how many jobs are queued, and the runtime version
  and model list.
- **Every job result:** the output text of that job, with the token counts and duration the runtime
  reported. The coordinator treats these figures as informational and measures what counts for
  payment itself.
- **Every request:** the node address, a timestamp, a random nonce, the signature, and a user agent
  with the client version. Like any server you connect to, the coordinator also sees your IP
  address.

To the local model runtime: the prompts of the jobs the coordinator assigns.

The client sends no files, no hostname and no user name. It does not write prompts or outputs to
disk, and its logs record only job ids, models, timings and token counts. The model runtime may
keep logs of its own.

## Where the node keeps its files

| System | Folder |
|---|---|
| Windows | `%APPDATA%\{{brand.configDirectory}}` |
| Other systems | `$XDG_CONFIG_HOME/{{brand.configDirectory}}`, or `~/.config/{{brand.configDirectory}}` |

The folder holds `node-key.json`, the node key, and `settings.json`, the network and the
coordinator URLs. `status` prints the exact path.

- On systems other than Windows, the key file is created readable by your user only (mode
  `0600`), and the client warns if that changes. On Windows it relies on the permissions of your
  user profile.
- The client never prints, logs or sends the private key.
- Back the key file up. If it is lost, run `init --force` and deploy the new key as a new rig.
- If it leaks, anyone holding it can act as your rig. Retire the rig from the operator wallet,
  then deploy a new key.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The command succeeded, or the node stopped cleanly. |
| 1 | The command failed, for example because the coordinator refused the node. |
| 2 | No model runtime answered at the runtime URL. |
| 64 | The command line was invalid, or `start` has no coordinator URL. |

## Troubleshooting

| What you see | What to do |
|---|---|
| `HTTP 403` saying the node key is not a deployed rig | Deploy the rig first. The coordinator sees a new rig about a minute after the transaction lands. |
| `HTTP 403` saying the rig is retired | A retired rig cannot take work. Create a new key with `init --force` and deploy it. |
| `HTTP 401` with a note about the clock | Synchronize the system clock. |
| Exit code 2, no model runtime answered | Start the model runtime, or pass its address with `--runtime-url`. |
| The runtime has no models | Download at least one model into the runtime. |
| Connected, but no jobs arrive | Jobs come from the [playground](/playground). Check that the rig serves the model open jobs use, and read [Verification and rewards](verification-and-rewards.md). |
