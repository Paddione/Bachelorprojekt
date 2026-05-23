-- DB Audit Phase 5 — Cross-cluster drift fix (korczewski)
-- Generated 2026-05-23 from F-005 + F-006 findings.
--
-- F-005: public.systemtest_failure_outbox is missing 7 columns vs mentolder.
--        Most-recent ticket fix [T000019]/[T000021] (e77fb637) probably only
--        landed on mentolder. Back-fill on korczewski.
-- F-006: public.meetings.project_id (uuid, nullable) is missing on korczewski.
--
-- All columns are nullable OR have a DEFAULT, so adding them on a populated
-- table is safe and non-blocking.
--
-- Idempotent (IF NOT EXISTS); reversible (DROP COLUMN IF EXISTS).

BEGIN;

-- F-005: systemtest_failure_outbox columns
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'questionnaire';
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS run_id text;
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS test_result_id bigint;
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS test_id text;
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS test_name text;
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.systemtest_failure_outbox
  ADD COLUMN IF NOT EXISTS file_path text;

-- F-006: meetings.project_id
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS project_id uuid;

COMMIT;
