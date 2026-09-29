-- Settlements from draft to publication. The index is the pool's, known once the transaction lands.
CREATE TABLE settlements (
  id               bigserial PRIMARY KEY,
  settlement_index bigint UNIQUE,
  status           text NOT NULL CHECK (status IN ('sending', 'sent', 'published', 'failed')),
  vetoed           boolean NOT NULL DEFAULT false,
  root             text NOT NULL,
  total            numeric(78, 0) NOT NULL,
  inputs_digest    text,
  -- Kept as text: the digest covers these exact bytes, and jsonb would reorder keys.
  inputs           text,
  dump             jsonb,
  previous_index   bigint,
  from_epoch       bigint,
  to_epoch         bigint,
  tx_hash          text UNIQUE,
  block_number     bigint,
  published_at     timestamptz,
  claimable_at     timestamptz,
  error            text,
  created_at       timestamptz NOT NULL
);

CREATE INDEX settlements_open_idx ON settlements (id) WHERE status IN ('sending', 'sent');
CREATE INDEX settlements_unindexed_root_idx ON settlements (root) WHERE settlement_index IS NULL;

-- Cumulative entitlements and proofs of each settlement, served to claimants.
CREATE TABLE entitlements (
  settlement_id bigint NOT NULL REFERENCES settlements (id),
  account       text NOT NULL,
  cumulative    numeric(78, 0) NOT NULL,
  proof         jsonb NOT NULL,
  PRIMARY KEY (settlement_id, account)
);

CREATE INDEX entitlements_account_idx ON entitlements (account, settlement_id DESC);
