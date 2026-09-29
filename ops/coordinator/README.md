# Coordinator deployment

The coordinator runs from `ops/coordinator/Dockerfile`, built from the repository root. Node runs
the TypeScript sources directly, so there is no build step: the image installs the coordinator's
production dependencies, copies the shared package and the coordinator sources, and starts
`node apps/coordinator/src/server.ts`.

## Hosting

Point the host's Dockerfile setting at `ops/coordinator/Dockerfile` and keep the build context at
the repository root, because the image copies the workspace manifests and the shared package.

Attach a Postgres database and pass its connection string as `DATABASE_URL`. Migrations run at
startup. The service listens on `PORT`, and `GET /health` answers without touching the database.

## Environment

Secrets are set on the platform only, never in the repository.

| Variable | Required |
|---|---|
| `DATABASE_URL` | yes |
| `PORT` | no |
| `NETWORK` | no |
| `RPC_URL` | no |
| `PUBLISHER_PRIVATE_KEY` | no; without it settlement runs in dry mode and never publishes |
| `CORS_ORIGINS` | no |
| `EPOCH_SECONDS` | no |
| `HEARTBEAT_SECONDS` | no |
| `REDUNDANCY_RATE` | no |
| `PLAYGROUND_MAX_TOKENS` | no |
| `PLAYGROUND_MODEL` | no |
| `TRUST_PROXY_HOPS` | no |
| `LOG_LEVEL` | no |

Defaults and accepted values are defined in `apps/coordinator/src/config.ts`.
