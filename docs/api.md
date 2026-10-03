# Coordinator API

The coordinator assigns jobs, checks results, measures verified work and publishes settlements. Its
public API serves the site: network figures, the launchpad board, rig pages, the Burn Pool, claims
and the playground. Everything it reports about the chain is read from the chain.

The testnet base URL is `{{coordinator.url}}`.

```sh
curl {{coordinator.url}}/v1/network
```

## Conventions

- **JSON over HTTPS.** Reads are `GET`. Writes are `POST` with `content-type: application/json`,
  and a body of at most 256 KiB.
- **Amounts** are in wei, as decimal strings. **Times** are ISO 8601 strings in UTC.
- **Addresses** are accepted in any letter case and returned in lower case.
- **Browsers** can call the API only from the origins the coordinator allows, such as the site.
- **Rate limits.** 600 requests per minute per client address, and 5 playground prompts per minute.
  Over the limit, the API answers `429` with the code `rate_limited`.
- The examples below show the shape of each response. **Their values are illustrative.**

### Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request query is not valid.",
    "details": [{ "path": "query.limit", "message": "…" }]
  }
}
```

`details` appears only on `invalid_request`, with one entry per problem found.

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | A path, query or body value failed validation. |
| 404 | `not_found` | There is no such route. |
| 404 | `rig_not_found`, `settlement_not_found`, `job_not_found` | The rig, settlement or job does not exist. |
| 413 | `payload_too_large` | The body is over 256 KiB. |
| 415 | `unsupported_media_type` | The body is not JSON. |
| 429 | `rate_limited` | Too many requests. The message says when to try again. |
| 503 | `busy` | Too many playground prompts are waiting. Try again in a minute. |
| 500 | `internal_error` | Something failed on the coordinator. |

The signed node routes add their own codes; see [Node protocol](node-protocol.md#errors).

## GET /health

Answers from memory, without touching the database or the chain.

```json
{ "status": "ok", "version": "0.1.0", "network": "testnet", "chainId": {{testnet.chainId}} }
```

## GET /v1/network

Live network figures: rigs online, verified work over the last 24 hours, the pool, the current
campaign, the current epoch, the model and output limit of open jobs, and the work rules as text.

```json
{
  "network": "testnet",
  "chainId": {{testnet.chainId}},
  "rigs": { "online": 3, "total": 5 },
  "last24h": {
    "verifiedUnits": "1840",
    "jobsCompleted": { "chat": 42, "benchmark": 6, "challenge": 31 }
  },
  "pool": {
    "totalBurned": "10000000000000000",
    "committed": "300000000000000",
    "releasable": "340000000000000",
    "asOf": { "block": "126100000", "time": "2026-09-29T12:00:05.000Z" }
  },
  "campaign": {
    "id": "1",
    "memo": "genesis",
    "burned": "10000000000000000",
    "burns": 1,
    "firstBurnAt": "2026-09-29T08:00:00.000Z",
    "lastBurnAt": "2026-09-29T08:00:00.000Z"
  },
  "epoch": {
    "index": 497412,
    "seconds": 3600,
    "startedAt": "2026-09-29T12:00:00.000Z",
    "endsAt": "2026-09-29T13:00:00.000Z"
  },
  "jobs": { "model": "<model tag>", "maxTokens": 256, "minUnitsPerSecond": 40 },
  "rules": {
    "units": "Work units are estimated tokens: …",
    "verification": "Only verified work earns rewards. …",
    "standing": "New rigs start on probation …"
  }
}
```

- A rig counts as online when the coordinator heard from it within the last three heartbeat
  intervals. Retired rigs are not counted.
- `last24h.verifiedUnits` counts verified playground work.
- `jobs.minUnitsPerSecond` is the speed [Sentinel](sentinel.md#2-proof-of-gpu) asks a rig to reach
  on `jobs.model` before it gets open work, in work units per second.
- `pool` is `null` until the coordinator's first read of the pool succeeds. `campaign` is `null`
  before the first burn with a non-zero campaign id.

## GET /v1/rigs

The launchpad board. Retired rigs are left out.

| Query | Values | Default |
|---|---|---|
| `sort` | `new` (newest first), `top` (most lifetime verified units), `epoch` (most verified units this epoch) | `new` |
| `pair` | `eth`, or a token address | all pairs |
| `operator` | an operator wallet address | all operators |
| `limit` | 1 to 100 | 50 |
| `offset` | 0 to 100,000 | 0 |

```json
{
  "total": 5,
  "limit": 50,
  "offset": 0,
  "epoch": 497412,
  "rigs": [
    {
      "nodeKey": "0x1111111111111111111111111111111111111111",
      "name": "Desk rig",
      "operator": "0x2222222222222222222222222222222222222222",
      "pair": "0x0000000000000000000000000000000000000000",
      "deployedAt": "2026-09-29T09:30:00.000Z",
      "online": true,
      "lastSeenAt": "2026-09-29T12:10:30.000Z",
      "models": ["example-model:1b"],
      "verifiedUnits": { "epoch": "120", "lifetime": "960" },
      "checks": { "passed": 14, "failed": 1 },
      "standing": "trusted"
    }
  ]
}
```

- `pair` is the zero address for ETH.
- `standing` is `probation`, `trusted` or `quarantined`; see
  [Sentinel](sentinel.md#5-reputation).
- `operator` returns only the rigs that wallet operates. The [Claim page](/claim) uses it to
  default a claim to the asset those rigs pair with. An address that operates no live rig gets
  `total` 0 and an empty list.

## GET /v1/rigs/:nodeKey

One rig, including retired ones, with its verified units for each of the last 24 hours, oldest
first, empty hours included. Answers `404 rig_not_found` for a node key that was never deployed.

```json
{
  "nodeKey": "0x1111111111111111111111111111111111111111",
  "name": "Desk rig",
  "operator": "0x2222222222222222222222222222222222222222",
  "pair": "0x0000000000000000000000000000000000000000",
  "deployedAt": "2026-09-29T09:30:00.000Z",
  "online": true,
  "lastSeenAt": "2026-09-29T12:10:30.000Z",
  "models": ["example-model:1b"],
  "verifiedUnits": { "epoch": "120", "lifetime": "960" },
  "checks": { "passed": 14, "failed": 1 },
  "standing": "trusted",
  "retired": false,
  "retiredAt": null,
  "deployedBlock": "126050000",
  "hourly": [
    { "hour": "2026-09-28T13:00:00.000Z", "verifiedUnits": "0" },
    { "hour": "2026-09-29T12:00:00.000Z", "verifiedUnits": "120" }
  ]
}
```

The example shows two of the 24 `hourly` entries.

## GET /v1/pool

The Burn Pool's state, the current campaign, and the 20 most recent burns and settlements.

```json
{
  "state": {
    "totalBurned": "10000000000000000",
    "committed": "300000000000000",
    "releasable": "340000000000000",
    "asOf": { "block": "126100000", "time": "2026-09-29T12:00:05.000Z" },
    "releaseBpsPerDay": "{{testnet.releaseBpsPerDay}}",
    "challengeDelaySeconds": "{{testnet.challengeDelaySeconds}}",
    "deployedAt": "2026-09-29T07:00:00.000Z",
    "settlementCount": 1,
    "head": 1,
    "pending": null
  },
  "campaign": {
    "id": "1",
    "memo": "genesis",
    "burned": "10000000000000000",
    "burns": 1,
    "firstBurnAt": "2026-09-29T08:00:00.000Z",
    "lastBurnAt": "2026-09-29T08:00:00.000Z"
  },
  "burns": [
    {
      "txHash": "0xaaaa…",
      "block": "126010000",
      "time": "2026-09-29T08:00:00.000Z",
      "from": "0x3333333333333333333333333333333333333333",
      "amount": "10000000000000000",
      "campaignId": "1",
      "memo": "genesis"
    }
  ],
  "settlements": [
    {
      "index": 1,
      "root": "0xbbbb…",
      "total": "300000000000000",
      "vetoed": false,
      "txHash": "0xcccc…",
      "block": "126090000",
      "publishedAt": "2026-09-29T11:01:00.000Z",
      "claimableAt": "2026-09-29T11:31:00.000Z",
      "epochs": { "from": 497408, "to": 497410 }
    }
  ]
}
```

- `state` is `null` until the first read of the pool succeeds.
- `pending` names the newest settlement while it is inside its challenge delay, with the time it
  becomes claimable, and is `null` otherwise.
- `memo` is the burn memo as text when it holds printable text, and `null` otherwise.
- `epochs` is `null` for a settlement this coordinator did not build.

## GET /v1/settlements/:index

One published settlement with everything needed to check it: the inputs document byte for byte,
its digest, and the full Merkle tree. Answers `404 settlement_not_found` for an unknown index.

```json
{
  "index": 1,
  "root": "0xbbbb…",
  "total": "300000000000000",
  "vetoed": false,
  "txHash": "0xcccc…",
  "block": "126090000",
  "publishedAt": "2026-09-29T11:01:00.000Z",
  "claimableAt": "2026-09-29T11:31:00.000Z",
  "epochs": { "from": 497408, "to": 497410 },
  "inputsDigest": "0xdddd…",
  "inputsJson": "{\"version\":2,\"chainId\":{{testnet.chainId}},…}",
  "inputs": {
    "version": 2,
    "chainId": {{testnet.chainId}},
    "burnPool": "0x…",
    "previousIndex": 0,
    "fromEpoch": 497408,
    "toEpoch": 497410,
    "epochSeconds": 3600,
    "poolBlock": "126089990",
    "poolTimestamp": "1790679655",
    "budget": "300000000000000",
    "work": [{ "nodeKey": "0x1111…", "account": "0x2222…", "verified": "960", "units": "960" }],
    "allocation": [{ "account": "0x2222…", "amount": "300000000000000" }],
    "entitlements": [{ "account": "0x2222…", "cumulative": "300000000000000" }]
  },
  "tree": {
    "format": "standard-v1",
    "leafEncoding": ["address", "uint256"],
    "tree": ["0x…"],
    "values": [{ "value": ["0x2222…", "300000000000000"], "treeIndex": 0 }]
  },
  "howToVerify": "Rebuilding `tree` must give `root`: …"
}
```

- `inputs` is `inputsJson` parsed. The digest covers the exact bytes of `inputsJson`.
- In `work`, `verified` is a rig's verified units over the epochs and `units` the units it is
  paid for after Sentinel weighs them by standing. The split uses `units`. Settlements built
  before Sentinel carry version 1, with `units` only.
- `inputsDigest`, `inputsJson`, `inputs` and `tree` are `null` for a settlement this coordinator did
  not build.
- [Verification and rewards](verification-and-rewards.md#check-a-settlement-yourself) explains the
  checks.

## GET /v1/claims/:account

What an operator wallet can claim now, with the proof for the claim call.

```json
{
  "account": "0x2222222222222222222222222222222222222222",
  "cumulative": "300000000000000",
  "claimed": "0",
  "claimable": "300000000000000",
  "settlement": {
    "index": 1,
    "root": "0xbbbb…",
    "claimableAt": "2026-09-29T11:31:00.000Z"
  },
  "proof": ["0xeeee…"],
  "pending": null
}
```

- `cumulative` is the wallet's total in the newest claimable settlement. `claimed` sums the pool's
  `Claimed` events for the wallet.
- Pass `settlement.index`, `cumulative` and `proof` to the Burn Pool's `claim` or `claimVia`.
- `settlement` is `null` and `proof` is empty when no claimable settlement includes the wallet.
- `pending` shows a newer settlement still inside its challenge delay, with the wallet's cumulative
  total in it and when it becomes claimable.

## GET /v1/sentinel

The decisions of each of [Sentinel](sentinel.md)'s five gates over the last 24 hours, and the
deployed rigs by standing.

```json
{
  "asOf": "2026-09-30T12:00:00.000Z",
  "gates": [
    { "gate": "identity", "passed": 41, "blocked": 7 },
    { "gate": "gpu", "passed": 38, "blocked": 3 },
    { "gate": "canary", "passed": 120, "blocked": 4 },
    { "gate": "crosscheck", "passed": 96, "blocked": 2 },
    { "gate": "reputation", "passed": 5, "blocked": 1 }
  ],
  "standing": { "probation": 2, "trusted": 5, "quarantined": 1 }
}
```

- `gates` always lists the five gates, in order. Counts are kept per minute, so the window starts
  at the minute 24 hours before `asOf`.
- `identity`: accepted hellos pass; refused signatures, replays, unknown rigs, spent budgets and
  early hellos are blocked.
- `gpu`: each timed answer passes, unless the rig is below the speed floor on its recent answers.
- `canary`: canaries passed, and wrong or missed answers to confirmed canaries.
- `crosscheck`: comparisons settled with agreement, and rigs on the losing side of a tiebreak.
- `reputation`: rigs that became trusted, and rigs put in quarantine.
- `standing` counts rigs that are not retired.

## POST /v1/playground/jobs

Sends a prompt to the network. Prompts go to rigs run by independent operators, so do not include
private information.

```json
{ "prompt": "Explain what a Merkle proof is in two sentences." }
```

The prompt is 1 to 2,000 characters after trimming. The answer is `202 Accepted`:

```json
{ "id": "7b0c7f9e-3c1d-4f7e-9a51-2d4b8c6e1f20", "status": "queued" }
```

It answers `503 busy` when 200 playground jobs are already waiting in the queue.

## GET /v1/playground/jobs/:id

A prompt's progress, its answer and how far the answer was checked.

```json
{
  "id": "7b0c7f9e-3c1d-4f7e-9a51-2d4b8c6e1f20",
  "status": "done",
  "prompt": "Explain what a Merkle proof is in two sentences.",
  "output": "A Merkle proof is …",
  "rig": { "nodeKey": "0x1111111111111111111111111111111111111111", "name": "Desk rig" },
  "crossChecked": true,
  "verification": "verified",
  "createdAt": "2026-09-29T12:01:00.000Z",
  "finishedAt": "2026-09-29T12:01:09.000Z",
  "rule": "Only verified work earns rewards. …"
}
```

| Field | Values |
|---|---|
| `status` | `queued`, `running`, `checking` (one answer is in and a second rig is still working), `done`, `expired` |
| `verification` | `pending`, `verified`, `unverified`, `mismatch` |
| `output`, `rig` | `null` until no rig still holds the prompt |
| `crossChecked` | Whether a second rig's answer was compared with this one |

## Node routes

Nodes use three `POST` routes, each signed with the node key: `{{protocol.route.hello}}`,
`{{protocol.route.heartbeat}}` and `{{protocol.route.result}}`. [Node protocol](node-protocol.md)
describes the signature and every message.
