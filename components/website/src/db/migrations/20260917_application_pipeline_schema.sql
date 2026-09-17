-- Migration: applications.* schema for application pipeline (Phase 1, T900228)
-- Tables: applications.jobs, applications.dossiers, applications.timeline

CREATE SCHEMA IF NOT EXISTS applications;

CREATE TABLE IF NOT EXISTS applications.jobs (
  id            SERIAL PRIMARY KEY,
  company       TEXT NOT NULL,
  role_title    TEXT NOT NULL,
  source_url    TEXT,
  raw_text      TEXT NOT NULL,
  requirements  TEXT,
  status        TEXT NOT NULL DEFAULT 'found'
                CHECK (status IN ('found','drafting','applied','interviewing','offered','rejected','withdrawn')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company, role_title)
);

CREATE TABLE IF NOT EXISTS applications.dossiers (
  id            SERIAL PRIMARY KEY,
  job_id        INT NOT NULL REFERENCES applications.jobs(id) ON DELETE CASCADE,
  artifact_path TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('resume','cover_letter')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications.timeline (
  id            SERIAL PRIMARY KEY,
  job_id        INT NOT NULL REFERENCES applications.jobs(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexes (G-DB01)
CREATE INDEX IF NOT EXISTS idx_applications_dossiers_job_id ON applications.dossiers (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_timeline_job_id ON applications.timeline (job_id);

-- Permissions
GRANT USAGE ON SCHEMA applications TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA applications TO website;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA applications TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA applications GRANT ALL ON TABLES TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA applications GRANT ALL ON SEQUENCES TO website;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_readonly') THEN
    GRANT USAGE ON SCHEMA applications TO mcp_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA applications TO mcp_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA applications GRANT SELECT ON TABLES TO mcp_readonly;
  END IF;
END $$;
