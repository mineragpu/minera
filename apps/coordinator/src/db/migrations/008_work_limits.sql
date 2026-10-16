-- Paid units granted per epoch against a limit: one prompt source's network, or one pair of rigs
-- that verified each other. Work past a limit is still recorded as verified, but earns nothing.
CREATE TABLE work_limits (
  key   text NOT NULL,
  epoch bigint NOT NULL,
  used  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (key, epoch)
);

CREATE INDEX work_limits_epoch_idx ON work_limits (epoch);
