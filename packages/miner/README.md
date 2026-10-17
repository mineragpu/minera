# Node client

`rig` runs on a GPU owner's machine. It holds the rig's node key, produces the deploy code that
binds the rig to the operator's wallet, and runs inference jobs from the coordinator on a local
model runtime. It is published to npm as [`@minera-gpu/miner`](https://www.npmjs.com/package/@minera-gpu/miner).

**Status:** mainnet is open. Start against the mainnet coordinator at `https://api.mineragpu.tech`. Its
`GET /v1/network` reports the model open jobs use as `jobs.model`; load that model into your
runtime before you start. The testnet coordinator at `https://testnet-api.mineragpu.tech` keeps
running for testing.

## Requirements

- **A GPU with enough VRAM** to hold the models you serve. The node reports its installed models
  to the coordinator with every heartbeat.
- **The GPU driver**, with its command-line management tool on your `PATH`. The node reads the GPU
  model, VRAM and driver version from it. Without the tool, the node reports no GPU and still runs.
- **A local model runtime** compatible with the `/api/chat` interface on port 11434, running, with
  at least one model downloaded. The client downloads a model only when you start it with
  `--keep-model`.
- **Node.js 22 or later**, with npm, and **a wallet on the network** to deploy the rig from. This
  wallet is the rig's operator.
- **A synchronized system clock.** The coordinator rejects requests stamped more than 120 seconds
  away from its own time.

## Install

```sh
npm install --global @minera-gpu/miner
rig --version
```

This installs the `rig` command. To update, run the install again. To run from source instead,
clone [the repository](https://github.com/mineragpu/minera), run `npm ci` with Node.js 22.18 or
later, and use `node packages/miner/src/cli.ts` wherever this guide writes `rig`.

### Versions

- Each version on npm matches a signed tag and a release in the repository, with its notes in the
  [changelog](https://github.com/mineragpu/minera/blob/main/CHANGELOG.md).
- `0.x` versions were for testnet. `1.0.0` is the first mainnet version.
- The `latest` tag is the version to run. Release candidates for the next network go out under the
  `next` tag first, so `npm install --global @minera-gpu/miner` never picks one up.

## Run

The quickest way is to pair with the Deploy page. Open it, connect the operator wallet and run the
command it shows, which carries a one-time pairing code:

```sh
rig pair --code <code> --operator 0xYourWalletAddress --network mainnet --start --keep-model
```

`pair` creates the node key when there is none and hands the node address and deploy code to the
page through the coordinator. The node key stays on this machine. Name the rig and deploy it on the
page; the command waits until the rig is deployed, then starts the node.

To set up by hand instead:

1. **Create the node key and get the deploy code.**

   ```sh
   rig init --operator 0xYourWalletAddress --network mainnet
   ```

   This prints the node address, the network and registry, the deploy code, and the next step.
   `--network mainnet` targets mainnet; without it, `init` targets testnet. The node remembers
   the network, so later commands need no flag.

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
   rig start
   ```

   The node says hello, runs a benchmark job, then sends heartbeats and runs the jobs they carry.
   It uses the network's coordinator; `--coordinator <url>` picks another, which is remembered per
   network. If the
   network is unreachable, the node retries with a delay that doubles up to 60 seconds.

### Options

| Option | Commands | Meaning |
|---|---|---|
| `--operator <wallet>` | `init`, `code`, `pair` | The wallet that deploys and operates the rig. Required. |
| `--code <code>` | `pair` | The one-time pairing code from the Deploy page. Required. |
| `--start` | `pair` | Start the node once the rig is deployed. The `start` options below apply. |
| `--network <testnet\|mainnet>` | all | The network to use. Defaults to the one chosen at `init`. |
| `--force` | `init` | Replace an existing node key. |
| `--coordinator <url>` | `start`, `pair` | The coordinator URL. It must use https unless it is on this machine. |
| `--runtime-url <url>` | `status`, `start` | The model runtime. Defaults to `http://127.0.0.1:11434`. |
| `--concurrency <1-4>` | `start` | How many jobs run at once. Defaults to 1. |
| `--keep-model` | `start` | Download the model open jobs use when the runtime does not have it. |
| `--auto-claim <eth>` | `start` | Claim the operator's rewards once at least this much ETH is claimable. |
| `--rpc-url <url>` | `start` | With `--auto-claim`: the chain's https endpoint. Defaults to the network's. |
| `--quiet`, `-q` | all | Print only results, warnings and errors. |
| `--json` | all | Print one JSON object per line. |

## Autopilot

The node can run the rig's chores itself:

```sh
rig start --keep-model --auto-claim 0.001
```

Every 10 minutes while it runs, it:

- **reports the rig's Sentinel standing** and says when it changes, with a warning when the rig is
  quarantined;
- **with `--keep-model`, keeps the open-job model installed.** It reads `jobs.model` from the
  coordinator and asks the runtime to download it when it is missing, also once before the node
  starts. The runtime downloads it from its own registry;
- **with `--auto-claim <eth>`, claims for the operator** once at least that much ETH is claimable.
  The node key sends the Burn Pool's `claim` and pays the network fee; the pool pays the operator's
  wallet whoever sends it, so the key cannot send the ETH anywhere else. Send the node address a
  little ETH for fees. Each claim is simulated first, and a refusal is reported in plain words.

Auto-claim pays in ETH. To receive a tokenized stock instead, claim on the site's Claim page.

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
- With `--auto-claim`, the node address holds a little ETH for claim fees. Keep only what a few
  claims cost there: a copy of the key can spend it, but cannot redirect rewards.

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

With the autopilot, the node also reads the coordinator's public routes for its rig, the network and
the operator's claim. With `--auto-claim`, it sends the signed claim transaction, and the calls that
simulate it, to the chain endpoint (`--rpc-url`, or the network's default).

To the local model runtime: the prompts of the jobs the coordinator assigns, and with `--keep-model`
the name of the model to download.

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
