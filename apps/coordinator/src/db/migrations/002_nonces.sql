-- Nonces of signed node requests, kept until their timestamp can no longer be accepted.
CREATE TABLE nonces (
  node_key   text NOT NULL,
  nonce      text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (node_key, nonce)
);

CREATE INDEX nonces_expires_idx ON nonces (expires_at);
