# Node client

`rig` runs on a GPU owner's machine. It holds the rig's node key, produces the deploy code that
binds the rig to the operator's wallet, and runs inference jobs from the coordinator on a local
model runtime.

**Status:** the testnet is open. Start against the testnet coordinator at
`https://api.mineragpu.tech`. Its `GET /v1/network` reports the model open
jobs use as `jobs.model`; load that model into your runtime before you start.

## Requirements

- **A GPU with enough VRAM** to hold the models you serve. The node reports its installed models
  to the coordinator with every heartbeat.
- **The GPU driver**, with its command-line management tool on your `PATH`. The node reads the GPU
  model, VRAM and driver version from it. Without the tool, the node reports no GPU and still runs.
- **A local model runtime** compatible with the `/api/chat` interface on port 11434, running, with
  at least one model downloaded. The client never downloads models itself.
- **Node.js 22.18 or later.** The client runs its TypeScript sources directly.
- **Git and npm** to install, and **a wallet on the network** to deploy the rig from. This wallet
  is the rig's operator.
- **A synchronized system clock.** The coordinator rejects requests stamped more than 120 seconds
  away from its own time.

## Install

From a clone of this repository:

```sh
npm ci
```

The examples below write `rig` for `node packages/miner/src/cli.ts`, run from the repository root.
After `npm ci`, `npx --no rig` runs the same file. The `--no` flag stops npx from fetching an
unrelated package of the same name if the local link is missing.

## Run

1. **Create the node key and get the deploy code.**

   ```sh
   rig init --operator 0xYourWalletAddress
   ```

   This prints the node address, the network and registry, the deploy code, and the next step.
   Add `--network mainnet` to target mainnet once its registry is deployed. The default is
   testnet.

2. **Deploy the rig.** Open the Deploy page, connect the operator wallet you passed to `init`,
   paste the deploy code and send the deploy transaction from that wallet.

3. **Check the machine.**

   ```sh
   rig status
   ```

   This shows the node address, network, config directory, detected GPU, runtime version, installed
   models and coordinator URL. It contacts only the local runtime.

4. **Start the node.**

   ```sh
   rig start --coordinator https://coordinator.example
   ```

   The node says hello, runs a benchmark job, then sends heartbeats and runs the jobs they carry.
   The coordinator URL is remembered per network, so later runs need only `rig start`. If the
   network is unreachable, the node retries with a delay that doubles up to 60 seconds.

### Options

| Option | Commands | Meaning |
|---|---|---|
| `--operator <wallet>` | `init`, `code` | The wallet that deploys and operates the rig. Required. |
| `--network <testnet\|mainnet>` | all | The network to use. Defaults to the one chosen at `init`. |
| `--force` | `init` | Replace an existing node key. |
| `--coordinator <url>` | `start` | The coordinator URL. It must use https unless it is on this machine. |
| `--runtime-url <url>` | `status`, `start` | The model runtime. Defaults to `http://127.0.0.1:11434`. |
| `--concurrency <1-4>` | `start` | How many jobs run at once. Defaults to 1. |
| `--quiet`, `-q` | all | Print only results, warnings and errors. |
| `--json` | all | Print one JSON object per line. |

## The deploy code

The deploy code is the node key's signature over
`keccak256(abi.encode("rig-deploy-v1", chainId, registry, operator))`, signed as an EIP-191
personal message. The registry checks it when the operator deploys the rig.

- It authorizes one wallet to deploy this node key, on one registry, on one chain. It fails for any
  other wallet, registry or chain.
- It cannot move funds or sign anything else. It is not a secret.
- To print it again, for another wallet or network, run `rig code --operator 0x... [--network ...]`.

## The node key

The node key is the rig's identity. `rig init` creates it once and stores it as JSON in a per-user
directory:

| System | Directory |
|---|---|
| Windows | `%APPDATA%\<name>` |
| Other systems | `$XDG_CONFIG_HOME/<name>`, or `~/.config/<name>` |

`<name>` is the project name in lower case. `rig status` prints the exact path.

- On Linux and macOS the key file is created with mode `0600`, readable by your user only, and the
  client warns if that changes. On Windows it relies on the permissions of your user profile.
- The client never prints, logs or sends the private key.
- Back the file up. If it is lost, run `rig init --force` and deploy the new key as a new rig.
- If it leaks, anyone holding it can act as your rig. Retire the rig from the operator wallet with
  the registry's `retire` function, then deploy a new key.
- `rig init` refuses to overwrite an existing key unless you pass `--force`.

## What leaves this machine

To the coordinator at the URL you pass, and nowhere else:

- **Hello:** the client and protocol versions, the GPU model, VRAM and driver version, and the
  runtime version and installed model list.
- **Every heartbeat:** whether the node is busy, how many jobs are queued, and the runtime version
  and model list.
- **Every job result:** the output text of that job, with the token counts and duration the
  runtime reported. The coordinator treats these figures as informational and measures what
  counts for payment itself.
- **Every request:** the node address, a timestamp, a random nonce and the signature. Like any
  server you connect to, the coordinator also sees your IP address.

To the local model runtime: the prompts of the jobs the coordinator assigns.

The client sends no other files, no hostname and no user name. It does not write prompts or outputs
to disk, and its logs record only job ids, models, timings and token counts. The model runtime may
keep logs of its own.

## Stop

- **Ctrl+C, or SIGTERM from a service manager:** the node stops taking jobs, lets a running job
  finish and upload its result, and exits.
- **Ctrl+C a second time:** the node exits at once. The running job is abandoned and the
  coordinator reassigns it after its deadline.
- Jobs still queued when the node stops are left for the coordinator to reassign.
- To take the rig off the network for good, retire it from the operator wallet. To remove the
  client's files, delete the directory above, which deletes the node key.

## Output and exit codes

Each line starts with a UTC timestamp. `--quiet` keeps results, warnings and errors. `--json`
prints one object per line with machine-readable fields.

| Code | Meaning |
|---|---|
| 0 | The command succeeded, or the node stopped cleanly. |
| 1 | The command failed, for example because the coordinator refused the node. |
| 2 | No model runtime answered at the runtime URL. |
| 64 | The command line was invalid. |

## Limitations

- The node reports the first GPU its driver tool lists. The benchmark measures what the machine
  can do; the reported model is informational.
- One node drives one model runtime. Jobs for a model the runtime does not have fail and are
  reassigned.
- Everything the node reports about itself is informational. Payment values are derived by the
  coordinator.
