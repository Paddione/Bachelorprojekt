-- Error Log — T001594
-- 2026-07-03 — Records error-level log entries from server (Pino), browser, and pods.
-- Retention: 7 days (DELETE WHERE ts < now() - interval '7 days').

CREATE TABLE IF NOT EXISTS error_log (
  id bigserial PRIMARY KEY,
  ts timestamptz DEFAULT now(),
  source text CHECK(source IN ('server', 'browser', 'pod')),
  message text NOT NULL,
  namespace text,
  pod_name text,
  meta jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE error_log OWNER TO website;

CREATE INDEX IF NOT EXISTS error_log_ts_idx ON error_log (ts DESC);

GRANT SELECT, INSERT, DELETE ON error_log TO website;
GRANT USAGE, SELECT ON SEQUENCE error_log_id_seq TO website;
