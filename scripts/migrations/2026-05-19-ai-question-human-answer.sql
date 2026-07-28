-- OBSOLETE (T002331 — Schema-Diät). ai_question/human_answer were never
-- wired to any UI, script, or automation (verified against both brand DBs:
-- 0/1787 mentolder rows, 0/11 korczewski rows; the only reference besides
-- this file was an inert entry in the generic ticket PATCH field whitelist).
-- Dropped via scripts/migrations/2026-07-28-schema-diaet-T002331.sql.
-- This file is kept only so the migration runner's history stays intact;
-- it is now a no-op ADD COLUMN IF NOT EXISTS that never fires again after
-- the DROP COLUMN below has run once.
ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS ai_question  TEXT,
  ADD COLUMN IF NOT EXISTS human_answer TEXT;
