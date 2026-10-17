-- A GPU machine's node address and deploy code, waiting under the one-time code the Deploy page
-- made. Nothing here is secret: the deploy code only lets the named operator deploy the node.
CREATE TABLE pairings (
  code           text PRIMARY KEY,
  node_key       text NOT NULL,
  operator       text NOT NULL,
  deploy_code    text NOT NULL,
  gpu_model      text,
  gpu_vram_mb    integer,
  client_version text NOT NULL,
  paired_at      timestamptz NOT NULL,
  expires_at     timestamptz NOT NULL
);

CREATE INDEX pairings_expires_idx ON pairings (expires_at);
