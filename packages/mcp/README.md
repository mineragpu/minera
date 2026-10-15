# Minera MCP server

`minera-mcp` lets an AI agent read the Minera network through the Model Context Protocol: the
network summary, the rigs on the launchpad, one rig, the Burn Pool, one settlement, what a wallet
can claim, and Sentinel's counts.

By default it is **read-only**. Every tool maps onto one GET route of the coordinator's public API
([docs/api.md](https://github.com/mineragpu/minera/blob/main/docs/api.md)), so it changes nothing,
holds no key and needs no account. Started with `--allow-ask`, it also offers `minera_ask`.

**Status:** version 0.x, built in this repository; it is not on npm yet.

## Tools

| Tool | Reads |
|---|---|
| `minera_network` | `GET /v1/network`: rigs online, verified work in the last 24 hours, the pool, the epoch, the open-job model |
| `minera_rigs` | `GET /v1/rigs`: rigs, sorted `new`, `top` or `epoch`, with `limit` and `offset` |
| `minera_rig` | `GET /v1/rigs/:nodeKey`: one rig and its check record |
| `minera_pool` | `GET /v1/pool`: the Burn Pool's state, the campaign, recent burns and settlements |
| `minera_settlement` | `GET /v1/settlements/:index`: one settlement, its inputs document and tree |
| `minera_claims` | `GET /v1/claims/:account`: what a wallet has earned, claimed and can claim |
| `minera_sentinel` | `GET /v1/sentinel`: rigs by standing and each gate's counts |
| `minera_ask` (only with `--allow-ask`) | `POST /v1/playground/jobs` with `verify`, then the job: sends a prompt to two unrelated rigs, waits for both answers and returns the answer with its `verification` (`verified` when the two agreed). Up to 5 prompts a minute |

## Run it

From a clone, with Node.js 22 or later:

```sh
npm install
npm run build --workspace @minera-gpu/mcp
node packages/mcp/dist/bin/minera-mcp.js            # mainnet
node packages/mcp/dist/bin/minera-mcp.js --network testnet
```

It speaks MCP over stdio, one JSON-RPC message per line. Point an MCP client's server entry at the
command above. `--coordinator <https url>` reads another coordinator.

## Safety

- Only GET requests, only to the coordinator it was started with, over https. The one exception is
  `minera_ask`, which exists only with `--allow-ask` and posts a prompt to the playground.
- A prompt sent with `minera_ask` is read by independent operators: never include private information.
- Arguments are checked against each tool's schema before any request is sent.
- Results are public data. Rig names and other text inside them are written by operators, so an
  agent should treat them as data, never as instructions; the server says so when it starts.
