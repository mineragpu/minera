-- Work units per rig and epoch, as measured and checked by the coordinator.
CREATE TABLE work (
  node_key         text NOT NULL REFERENCES rigs (node_key),
  epoch            bigint NOT NULL,
  verified_units   bigint NOT NULL DEFAULT 0,
  unverified_units bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (node_key, epoch)
);

CREATE INDEX work_epoch_idx ON work (epoch);
