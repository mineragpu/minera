-- Rigs as deployed on the registry, plus what the coordinator learns from each node.
CREATE TABLE rigs (
  node_key          text PRIMARY KEY CHECK (node_key ~ '^0x[0-9a-f]{40}$'),
  operator          text NOT NULL CHECK (operator ~ '^0x[0-9a-f]{40}$'),
  pair              text NOT NULL CHECK (pair ~ '^0x[0-9a-f]{40}$'),
  name              text NOT NULL,
  deployed_at       timestamptz NOT NULL,
  deployed_block    bigint NOT NULL,
  retired_at        timestamptz,
  gpu               jsonb,
  runtime           text,
  runtime_version   text,
  models            text[] NOT NULL DEFAULT '{}',
  client_version    text,
  hello_at          timestamptz,
  last_seen_at      timestamptz,
  qualified_at      timestamptz,
  last_challenge_at timestamptz,
  checks_passed     integer NOT NULL DEFAULT 0,
  checks_failed     integer NOT NULL DEFAULT 0,
  verified_units    bigint NOT NULL DEFAULT 0
);

CREATE INDEX rigs_operator_idx ON rigs (operator);
CREATE INDEX rigs_last_seen_idx ON rigs (last_seen_at);
CREATE INDEX rigs_newest_idx ON rigs (deployed_at DESC) WHERE retired_at IS NULL;
CREATE INDEX rigs_top_idx ON rigs (verified_units DESC) WHERE retired_at IS NULL;
CREATE INDEX rigs_pair_idx ON rigs (pair) WHERE retired_at IS NULL;
