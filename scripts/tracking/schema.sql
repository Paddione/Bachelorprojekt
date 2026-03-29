-- ═══════════════════════════════════════════════════════════════════
-- Homeoffice MVP — Requirements & Pipeline Tracking Schema
-- ═══════════════════════════════════════════════════════════════════
-- Usage: sqlite3 tracking.db < schema.sql
--
-- Pipeline stages per requirement:
--   idea → implementation → testing → documentation → archive
-- ═══════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Requirements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requirements (
  id                TEXT PRIMARY KEY,   -- FA-01, SA-03, L-02 …
  category          TEXT NOT NULL,      -- Funktionale Anforderung, Nicht-Funktionale Anforderung, Sicherheitsanforderung, Akzeptanzkriterium, Auslieferbares Objekt
  name              TEXT NOT NULL,      -- Bezeichnung
  description       TEXT,               -- Beschreibung
  acceptance_criteria TEXT,             -- Erfüllungskriterien
  test_cases        TEXT,               -- Testfall (free-text)
  automated         INTEGER DEFAULT 0,  -- 1 = has automated test script
  created_at        TEXT DEFAULT (datetime('now'))
);

-- ── Pipeline stages ─────────────────────────────────────────────
-- One row per (requirement × stage). Tracks where each req stands.
CREATE TABLE IF NOT EXISTS pipeline (
  req_id      TEXT    NOT NULL REFERENCES requirements(id),
  stage       TEXT    NOT NULL CHECK (stage IN (
                        'idea','implementation','testing','documentation','archive')),
  status      TEXT    DEFAULT 'pending' CHECK (status IN (
                        'pending','in_progress','done','fail','skip')),
  updated_at  TEXT    DEFAULT (datetime('now')),
  commit_ref  TEXT,          -- git SHA that moved this stage
  notes       TEXT,
  PRIMARY KEY (req_id, stage)
);

-- ── Test runs (one row per invocation of runner.sh) ─────────────
CREATE TABLE IF NOT EXISTS test_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date    TEXT    NOT NULL,
  tier        TEXT    NOT NULL,    -- local, prod
  host        TEXT,
  total       INTEGER DEFAULT 0,
  pass        INTEGER DEFAULT 0,
  fail        INTEGER DEFAULT 0,
  skip        INTEGER DEFAULT 0,
  json_path   TEXT               -- path to the full JSON report
);

-- ── Individual test results ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES test_runs(id),
  req_id      TEXT    NOT NULL,
  test_name   TEXT    NOT NULL,
  description TEXT,
  status      TEXT    CHECK (status IN ('pass','fail','skip')),
  duration_ms INTEGER,
  detail      TEXT
);

-- ── Views ───────────────────────────────────────────────────────

-- Current pipeline status: one row per requirement with stage statuses
CREATE VIEW IF NOT EXISTS v_pipeline_status AS
SELECT
  r.id,
  r.category,
  r.name,
  MAX(CASE WHEN p.stage = 'idea'           THEN p.status END) AS idea,
  MAX(CASE WHEN p.stage = 'implementation' THEN p.status END) AS implementation,
  MAX(CASE WHEN p.stage = 'testing'        THEN p.status END) AS testing,
  MAX(CASE WHEN p.stage = 'documentation'  THEN p.status END) AS documentation,
  MAX(CASE WHEN p.stage = 'archive'        THEN p.status END) AS archive
FROM requirements r
LEFT JOIN pipeline p ON p.req_id = r.id
GROUP BY r.id
ORDER BY r.category, r.id;

-- Latest test result per requirement
CREATE VIEW IF NOT EXISTS v_latest_tests AS
SELECT
  tr.req_id,
  tr.test_name,
  tr.status,
  tr.duration_ms,
  tr.detail,
  t.run_date,
  t.tier
FROM test_results tr
JOIN test_runs t ON t.id = tr.run_id
WHERE t.id = (SELECT MAX(id) FROM test_runs)
ORDER BY tr.req_id, tr.test_name;

-- Summary: how many requirements are at each stage
CREATE VIEW IF NOT EXISTS v_progress_summary AS
SELECT
  stage,
  COUNT(*) FILTER (WHERE status = 'done')        AS done,
  COUNT(*) FILTER (WHERE status = 'in_progress')  AS in_progress,
  COUNT(*) FILTER (WHERE status = 'fail')         AS failed,
  COUNT(*) FILTER (WHERE status = 'pending')      AS pending,
  COUNT(*) FILTER (WHERE status = 'skip')         AS skipped,
  COUNT(*)                                         AS total
FROM pipeline
GROUP BY stage
ORDER BY CASE stage
  WHEN 'idea'           THEN 1
  WHEN 'implementation' THEN 2
  WHEN 'testing'        THEN 3
  WHEN 'documentation'  THEN 4
  WHEN 'archive'        THEN 5
END;
