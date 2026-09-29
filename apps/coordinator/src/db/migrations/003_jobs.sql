-- Work sent to rigs. A job compared across two rigs is two rows sharing a group.
CREATE TABLE jobs (
  id            uuid PRIMARY KEY,
  group_id      uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('chat', 'benchmark', 'challenge')),
  model         text NOT NULL,
  messages      jsonb NOT NULL,
  params        jsonb NOT NULL,
  expected      text,
  target_node   text REFERENCES rigs (node_key),
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'assigned', 'done', 'expired', 'cancelled')),
  assigned_node text REFERENCES rigs (node_key),
  assigned_at   timestamptz,
  deadline_at   timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  output        text,
  output_hash   text,
  units         integer,
  verification  text NOT NULL DEFAULT 'pending'
                CHECK (verification IN ('pending', 'verified', 'unverified', 'mismatch', 'failed')),
  created_at    timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  finished_at   timestamptz,
  verified_at   timestamptz
);

CREATE INDEX jobs_queue_idx ON jobs (created_at) WHERE status = 'queued';
CREATE INDEX jobs_deadline_idx ON jobs (deadline_at) WHERE status = 'assigned';
CREATE INDEX jobs_assigned_idx ON jobs (assigned_node, status);
CREATE INDEX jobs_target_idx ON jobs (target_node, status) WHERE target_node IS NOT NULL;
CREATE INDEX jobs_group_idx ON jobs (group_id);
CREATE INDEX jobs_finished_idx ON jobs (finished_at) WHERE status = 'done';
CREATE INDEX jobs_verified_idx ON jobs (verified_at) WHERE verification = 'verified';
CREATE INDEX jobs_rig_verified_idx ON jobs (assigned_node, verified_at) WHERE verification = 'verified';
