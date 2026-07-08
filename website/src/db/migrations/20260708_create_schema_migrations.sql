-- Migration tracking table — T001652
-- 2026-07-08 — Bootstrap table for website/src/db/migrate.ts, the automated
-- migration runner. Tracks which .sql files in this directory have been
-- applied so re-runs (and workspace:deploy) are idempotent.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE schema_migrations OWNER TO website;

GRANT SELECT, INSERT ON schema_migrations TO website;
