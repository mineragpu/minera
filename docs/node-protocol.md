# Node protocol

A node talks to the coordinator over three JSON `POST` routes. Every request is signed with the
node key, so the coordinator knows which rig sent it, and a signed request cannot be replayed or
sent to another network. This page is the reference for protocol version {{protocol.version}}.

| Route | Purpose |
|---|---|
| `{{protocol.route.hello}}` | Starts a session: reports the GPU and runtime, and receives the benchmark. |
| `{{protocol.route.heartbeat}}` | Reports load and models, and receives jobs. |
| `{{protocol.route.result}}` | Returns one job's output. |

## Signed requests

Every request carries four headers:

| Header | Value |
|---|---|
| `{{protocol.header.key}}` | The node address: `0x` and 40 hexadecimal characters. |
| `{{protocol.header.timestamp}}` | The time of signing, in Unix seconds. |
| `{{protocol.header.nonce}}` | A single-use value of 8 to 128 characters from `A-Z`, `a-z`, `0-9`, `_` and `-`. The node client sends 32 random hexadecimal characters. |
| `{{protocol.header.signature}}` | The node key's signature over the message below: `0x` and 130 hexadecimal characters. The 128-character compact form is accepted too. |

### The signed message

The message is seven lines joined by a line feed (`\n`), with no newline at the end:

```text
rig-request-v1
<chain id>
<METHOD>
<path>
<timestamp>
<nonce>
<body digest>
```

- **Chain id:** the chain of the network the node runs on, {{testnet.chainId}} on testnet. A
  request signed for one network is refused by the coordinator of another, even when the same node
  key is a rig on both.
- **Method:** in upper case, `POST`.
- **Path:** the request path, such as `{{protocol.route.hello}}`. The coordinator checks it against
  the path it received, including any query string; the node routes have none. The node client
  signs the path of the full URL, so a proxy in front of the coordinator must not rewrite it.
- **Timestamp:** the same value as the timestamp header.
- **Nonce:** the same value as the nonce header.
- **Body digest:** `keccak256` of the exact body bytes sent, as `0x` and 64 lower-case hexadecimal
  characters. The coordinator hashes the raw bytes it received, not a re-serialized copy, so sign
  the bytes you send. An empty body hashes to `{{protocol.emptyBodyDigest}}`.

The node signs the message as an EIP-191 personal message, the same way a wallet signs text.

An example message, with illustrative values:

```text
rig-request-v1
{{testnet.chainId}}
POST
{{protocol.route.heartbeat}}
1790683230
9f2c4e1ab07d53c8e6f1a2b3c4d5e6f7
0x6c1b7c1f0d2a9e4b8f3c5d7e9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b
```

### How the coordinator checks a request

1. All four headers are present and well formed.
2. The timestamp is within {{protocol.skewSeconds}} seconds of the coordinator's clock, in either
   direction.
3. The address recovered from the signature equals the node address header.
4. The node address is a deployed rig on the registry, and the rig is not retired.
5. The nonce was not used before by this node key. It is recorded only after the checks above
   pass, and kept until the timestamp falls out of the allowed window.

Values that decide payment are never taken from the request. The coordinator measures them.

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | The body failed validation, for example an unsupported protocol version. |
| 401 | `missing_header` | A signing header is missing. |
| 401 | `malformed_header` | A signing header has the wrong format. |
| 401 | `stale_request` | The timestamp is more than {{protocol.skewSeconds}} seconds away from the coordinator's clock. |
| 401 | `bad_signature` | The signature cannot be read, or it was not made by the node address. |
| 401 | `replayed_request` | The nonce was already used. Send a fresh nonce with every request. |
| 403 | `unknown_rig` | The node key is not a deployed rig. Deploy it first. |
| 403 | `retired_rig` | The rig is retired and can no longer take work. |
| 403 | `not_assignee` | The job is not assigned to this rig. |
| 404 | `job_not_found` | There is no job with this id. |

Errors use the API's shape; see [Coordinator API](api.md#errors).

## Hello

Sent once when the node starts.

```json
{
  "protocol": {{protocol.version}},
  "clientVersion": "0.0.0",
  "gpu": { "model": "Example GPU", "vramMb": 24576, "driver": "550.54" },
  "runtime": { "runtime": "api-chat", "version": "0.5.7", "models": ["example-model:1b"] }
}
```

| Field | Rule |
|---|---|
| `protocol` | Must be {{protocol.version}}. |
| `clientVersion` | 1 to 64 characters. |
| `gpu` | `null`, or a model of 1 to 128 characters, `vramMb` as a whole number up to 10,000,000, and an optional driver version of up to 64 characters. |
| `runtime` | The runtime interface name (1 to 64 characters), an optional version (up to 64), and up to 64 model names of 1 to 128 characters. |

The reply names the rig as the registry records it, the heartbeat interval, and the benchmark:

```json
{
  "rig": {
    "nodeKey": "0x1111111111111111111111111111111111111111",
    "operator": "0x2222222222222222222222222222222222222222",
    "name": "Desk rig",
    "pair": "0x0000000000000000000000000000000000000000"
  },
  "heartbeatSeconds": 30,
  "benchmark": {
    "id": "0c9e2a64-8f3b-4d1e-a7c5-3b9d2e6f1a48",
    "kind": "benchmark",
    "model": "example-model:1b",
    "params": { "temperature": 0, "seed": 184467, "maxTokens": 16 },
    "messages": [
      { "role": "system", "content": "You are a calculator. Reply with the number only." },
      { "role": "user", "content": "What is 47 plus 38?" }
    ],
    "deadlineSeconds": 300
  }
}
```

`benchmark` is `null` when the node reports no models. Each hello withdraws any earlier open
benchmark, so only the latest one counts. The rig receives open jobs only after it passes a check
since its latest hello.

## Heartbeat

Sent every `heartbeatSeconds`. The node client keeps the interval between 5 and 300 seconds
whatever the reply says.

```json
{
  "load": { "busy": false, "queue": 0 },
  "runtime": { "runtime": "api-chat", "version": "0.5.7", "models": ["example-model:1b"] }
}
```

`busy` is true while the node runs as many jobs as its concurrency allows, and `queue` counts the
jobs waiting on the node, from 0 to 10,000. The reply carries the next interval and any jobs:

```json
{
  "heartbeatSeconds": 30,
  "jobs": [
    {
      "id": "5d7f1c3a-2b4e-4a6c-9d8e-1f3a5b7c9d0e",
      "kind": "chat",
      "model": "example-model:1b",
      "params": { "temperature": 0, "seed": 902113, "maxTokens": 256 },
      "messages": [
        { "role": "system", "content": "You are a helpful assistant. Answer clearly and briefly." },
        { "role": "user", "content": "Explain what a Merkle proof is in two sentences." }
      ],
      "deadlineSeconds": 120
    }
  ]
}
```

A busy node receives no jobs. A rig holds at most two jobs at a time, and every job is for a model
the node reported. `kind` is `chat`, `benchmark` or `challenge`; see
[Verification and rewards](verification-and-rewards.md#jobs).

## Result

Sent to `{{protocol.route.result}}` once a job finishes, before its deadline.

```json
{
  "output": "A Merkle proof is …",
  "reported": { "promptTokens": 31, "completionTokens": 48, "durationMs": 912 }
}
```

`output` is at most 32,000 characters. `reported` holds what the runtime said. It is kept for the
node's own records and never used for payment.

```json
{ "accepted": true }
```

A result for a job that is already finished or closed is not accepted, and the reply says why:

```json
{ "accepted": false, "reason": "A result for this job was already received." }
```

## The deploy code

Deploying a rig uses a different signature: the node key's EIP-191 signature over the registry's
deploy digest, `keccak256(abi.encode("rig-deploy-v1", chainId, registry, operator))`, signed as
the raw 32 bytes. See [Contracts](contracts.md#rig-registry).
