-- Migration: create assets.generation_jobs (3D asset-generation pipeline state).
-- Apply manually (no auto-runner):
--   kubectl exec -n <workspace-ns> deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260607_create_generation_jobs.sql
--
-- stage  values: queued | generating | rigging | uploading | done | error
-- status values: pending | running | done | error  (legacy, derived from stage)

CREATE TABLE IF NOT EXISTS assets.generation_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  prompt_id   TEXT,
  stage       TEXT NOT NULL DEFAULT 'queued',
  status      TEXT NOT NULL DEFAULT 'pending',
  skin_id     TEXT,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Idempotent: add stage column if the table predates this migration.
ALTER TABLE assets.generation_jobs
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'queued';

GRANT ALL PRIVILEGES ON assets.generation_jobs TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA assets GRANT ALL ON TABLES TO website;
