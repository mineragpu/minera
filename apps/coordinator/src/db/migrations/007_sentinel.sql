-- Sentinel: each rig's standing, network and measured speed; where each job came from; the canary
-- bank; strikes; epochs a rig spent in quarantine; and the public tally of gate decisions.
ALTER TABLE rigs
  ADD COLUMN standing          text NOT NULL DEFAULT 'probation'
                               CHECK (standing IN ('probation', 'trusted', 'quarantined')),
  ADD COLUMN canaries_passed   integer NOT NULL DEFAULT 0,
  ADD COLUMN quarantined_until timestamptz,
  ADD COLUMN network           text,
  ADD COLUMN speed_samples     double precision[] NOT NULL DEFAULT '{}',
  ADD COLUMN next_canary_at    timestamptz;

CREATE INDEX rigs_standing_idx ON rigs (standing) WHERE retired_at IS NULL;

ALTER TABLE jobs
  ADD COLUMN origin         text NOT NULL DEFAULT 'playground'
                            CHECK (origin IN ('playground', 'seed', 'canary', 'check')),
  ADD COLUMN origin_network text,
  ADD COLUMN canary_id      uuid;

UPDATE jobs SET origin = 'check' WHERE kind <> 'chat';

-- Units that count toward rewards after Sentinel weighs them by the rig's standing.
ALTER TABLE work ADD COLUMN paid_units bigint NOT NULL DEFAULT 0;

UPDATE work SET paid_units = verified_units;

-- Prompts whose answers two independent rigs agreed on. Sent later to other rigs as checks.
CREATE TABLE canaries (
  id            uuid PRIMARY KEY,
  model         text NOT NULL,
  messages      jsonb NOT NULL,
  params        jsonb NOT NULL,
  answer        text NOT NULL,
  -- Rigs that ever saw the prompt; it is never sent to them as a check.
  sources       text[] NOT NULL,
  served_to     text[] NOT NULL DEFAULT '{}',
  confirmations integer NOT NULL DEFAULT 0,
  disputes      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL
);

CREATE INDEX canaries_model_idx ON canaries (model, created_at);

CREATE TABLE strikes (
  id       bigserial PRIMARY KEY,
  node_key text NOT NULL REFERENCES rigs (node_key),
  reason   text NOT NULL CHECK (reason IN ('canary_failed', 'canary_missed', 'tiebreak_lost', 'job_abandoned')),
  at       timestamptz NOT NULL
);

CREATE INDEX strikes_rig_idx ON strikes (node_key, at);

-- Epochs in which a rig was quarantined. Its work in them earns nothing.
CREATE TABLE quarantines (
  node_key text NOT NULL REFERENCES rigs (node_key),
  epoch    bigint NOT NULL,
  PRIMARY KEY (node_key, epoch)
);

CREATE TABLE sentinel_tally (
  minute  timestamptz NOT NULL,
  gate    text NOT NULL CHECK (gate IN ('identity', 'gpu', 'canary', 'crosscheck', 'reputation')),
  outcome text NOT NULL CHECK (outcome IN ('passed', 'blocked')),
  count   integer NOT NULL,
  PRIMARY KEY (minute, gate, outcome)
);
