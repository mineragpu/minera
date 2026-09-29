-- Pool deposits and claims as emitted on-chain, and how far the indexer has read.
CREATE TABLE burns (
  tx_hash      text NOT NULL,
  log_index    integer NOT NULL,
  block_number bigint NOT NULL,
  block_time   timestamptz NOT NULL,
  sender       text NOT NULL,
  amount       numeric(78, 0) NOT NULL,
  campaign_id  numeric(78, 0) NOT NULL,
  memo         text NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX burns_recent_idx ON burns (block_number DESC, log_index DESC);
CREATE INDEX burns_campaign_idx ON burns (campaign_id, block_number DESC) WHERE campaign_id > 0;

CREATE TABLE claims (
  tx_hash          text NOT NULL,
  log_index        integer NOT NULL,
  block_number     bigint NOT NULL,
  block_time       timestamptz NOT NULL,
  account          text NOT NULL,
  settlement_index bigint NOT NULL,
  amount           numeric(78, 0) NOT NULL,
  via              text NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX claims_account_idx ON claims (account);

CREATE TABLE chain_cursor (
  name  text PRIMARY KEY,
  block bigint NOT NULL
);
