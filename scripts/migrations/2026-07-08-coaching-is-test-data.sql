-- 2026-07-08-coaching-is-test-data.sql
-- Additive test-data flag for coaching sessions (T001638). Idempotent.
-- Apply to BOTH brand DBs (mentolder + korczewski) AND dev clusters before
-- deploying the website build that references the new column in createSession.
-- session_steps cascade via session_id → no own column needed.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE coaching.sessions
  ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
COMMIT;
