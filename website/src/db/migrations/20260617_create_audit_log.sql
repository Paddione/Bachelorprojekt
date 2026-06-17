-- Security Audit Log — T000904
-- 2026-06-17 — Records security-relevant admin actions (who did what when).
-- Retention: 90 days (manual/ensure prune via DELETE WHERE ts < now() - interval '90 days').

CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION website;

CREATE TABLE IF NOT EXISTS audit.audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    text,
  actor_email text,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  ip          inet,
  ts          timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb
);

ALTER TABLE audit.audit_log OWNER TO website;

CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit.audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit.audit_log (actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit.audit_log (action, ts DESC);

GRANT USAGE ON SCHEMA audit TO website;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA audit TO website;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT USAGE, SELECT ON SEQUENCES TO website;
