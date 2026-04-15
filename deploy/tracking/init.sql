-- Bachelorprojekt Requirements Tracking Schema
-- Apply to shared-db (postgres database) as the postgres superuser.
-- Usage: psql -h shared-db -U postgres -d postgres -f init.sql

CREATE SCHEMA IF NOT EXISTS bachelorprojekt;

CREATE TABLE IF NOT EXISTS bachelorprojekt.requirements (
  id          TEXT PRIMARY KEY,           -- FA-01, SA-03, NFA-02, AK-03 …
  category    TEXT NOT NULL,              -- FA, SA, NFA, AK, L
  name        TEXT NOT NULL,
  description TEXT,
  criteria    TEXT,
  test_case   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bachelorprojekt.pipeline (
  id         SERIAL PRIMARY KEY,
  req_id     TEXT NOT NULL REFERENCES bachelorprojekt.requirements(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL CHECK (stage IN ('idea','implementation','testing','documentation','archive')),
  entered_at TIMESTAMPTZ DEFAULT now(),
  notes      TEXT
);

CREATE TABLE IF NOT EXISTS bachelorprojekt.test_results (
  id      SERIAL PRIMARY KEY,
  req_id  TEXT NOT NULL REFERENCES bachelorprojekt.requirements(id) ON DELETE CASCADE,
  result  TEXT NOT NULL CHECK (result IN ('pass','fail','skip')),
  run_at  TIMESTAMPTZ DEFAULT now(),
  details TEXT
);

-- Latest pipeline stage per requirement
CREATE OR REPLACE VIEW bachelorprojekt.v_pipeline_status AS
SELECT
  r.id, r.name, r.category,
  COALESCE(p.stage, 'idea') AS current_stage,
  p.entered_at AS stage_since
FROM bachelorprojekt.requirements r
LEFT JOIN bachelorprojekt.pipeline p
  ON p.req_id = r.id
  AND p.entered_at = (
    SELECT MAX(p2.entered_at) FROM bachelorprojekt.pipeline p2 WHERE p2.req_id = r.id
  );

-- Progress count by stage
CREATE OR REPLACE VIEW bachelorprojekt.v_progress_summary AS
SELECT current_stage AS stage, COUNT(*) AS count
FROM bachelorprojekt.v_pipeline_status
GROUP BY current_stage
ORDER BY ARRAY_POSITION(ARRAY['idea','implementation','testing','documentation','archive'], current_stage);

-- Requirements not yet archived
CREATE OR REPLACE VIEW bachelorprojekt.v_open_issues AS
SELECT *
FROM bachelorprojekt.v_pipeline_status
WHERE current_stage != 'archive'
ORDER BY category, id;

-- Most recent test result per requirement
CREATE OR REPLACE VIEW bachelorprojekt.v_latest_tests AS
SELECT DISTINCT ON (req_id) req_id, result, run_at, details
FROM bachelorprojekt.test_results
ORDER BY req_id, run_at DESC;

-- Grant read access to the postgres superuser (already has it) and a dedicated role if desired
-- GRANT USAGE ON SCHEMA bachelorprojekt TO tracking_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA bachelorprojekt TO tracking_reader;
