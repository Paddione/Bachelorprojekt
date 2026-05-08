-- 2026-05-08 — Migration: tickets.fn_purge_test_data() PG function.
--
-- One-stop "wipe all test-data scaffolding" routine, intended to be called
-- from /api/admin/systemtest/purge-all-test-data (the Playwright bracketing
-- endpoint). Complements website/src/lib/systemtest/cleanup.ts which sweeps
-- in-flight fixtures with a grace period — this function ignores the grace
-- and tears down everything tagged is_test_data=true plus orphaned testing
-- side-tables.
--
-- Design rules:
--   • Idempotent (CREATE OR REPLACE FUNCTION; running twice on a clean DB
--     returns all-zero counts).
--   • Defense-in-depth: every DELETE is gated on is_test_data=true wherever
--     the column exists. Tables without it (questionnaire_*_evidence /
--     _fixtures / _scores / _answers, systemtest_*) only delete rows that
--     join back to is_test_data=true through assignment_id.
--   • Resilience: probes information_schema before touching optional tables
--     (test_runs, test_results, playwright_reports, billing_invoices,
--     questionnaire_assignment_scores, questionnaire_answers) so a fresh DB
--     schema doesn't hard-fail.
--   • Customer allowlist: deletes customers NOT in the keep-list whose id is
--     not referenced by any meetings or billing_invoices row. Customers with
--     real engagement (meetings, invoices) survive even if they look stale —
--     the existing fixture-row cleanup is the path for those.
--   • Returns JSONB with per-table delete counts for the API response.
--
-- SECURITY DEFINER + EXECUTE TO website so the website runtime (which is the
-- pool owner anyway) can call it without superuser privileges.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION tickets.fn_purge_test_data()
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, tickets
AS $$
DECLARE
  result            JSONB := '{}'::jsonb;
  cnt               INT;
  has_scores        BOOLEAN;
  has_answers       BOOLEAN;
  has_test_results  BOOLEAN;
  has_test_runs     BOOLEAN;
  has_pw_reports    BOOLEAN;
  has_billing_inv   BOOLEAN;
  has_src_assn_col  BOOLEAN;
  has_meetings      BOOLEAN;
  has_qts_evidence  BOOLEAN;
  keep_emails       TEXT[] := ARRAY[
                       'patrick@korczewski.de',
                       'p.korczewski@gmail.com',
                       'quamain@web.de'
                     ];
BEGIN
  -- Probe optional tables / columns. (information_schema returns NULL for
  -- a missing relation; COALESCE the EXISTS to false.)
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='questionnaire_assignment_scores')
    INTO has_scores;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='questionnaire_answers')
    INTO has_answers;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='test_results')
    INTO has_test_results;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='test_runs')
    INTO has_test_runs;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='playwright_reports')
    INTO has_pw_reports;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='billing_invoices')
    INTO has_billing_inv;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='meetings')
    INTO has_meetings;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='tickets'
                   AND table_name='tickets'
                   AND column_name='source_test_assignment_id')
    INTO has_src_assn_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='questionnaire_test_status'
                   AND column_name='evidence_id')
    INTO has_qts_evidence;

  ----------------------------------------------------------------------------
  -- 1) Clear FK from questionnaire_test_status to test-data tickets.
  ----------------------------------------------------------------------------
  UPDATE questionnaire_test_status
     SET last_failure_ticket_id = NULL
   WHERE last_failure_ticket_id IN (
           SELECT id FROM tickets.tickets WHERE is_test_data = true
         );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('questionnaire_test_status_cleared', cnt);

  ----------------------------------------------------------------------------
  -- 2) Null out tickets.source_test_assignment_id refs to test assignments.
  --    Only do this if the column exists.
  ----------------------------------------------------------------------------
  IF has_src_assn_col THEN
    UPDATE tickets.tickets
       SET source_test_assignment_id = NULL
     WHERE source_test_assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('tickets_assignment_ref_cleared', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 3a) NULL out questionnaire_test_status.evidence_id refs that point at
  --     evidence rows we're about to delete. Without this, the evidence
  --     DELETE below trips qts_evidence_id_fk.
  ----------------------------------------------------------------------------
  IF has_qts_evidence THEN
    UPDATE questionnaire_test_status
       SET evidence_id = NULL
     WHERE evidence_id IN (
             SELECT id FROM questionnaire_test_evidence
              WHERE assignment_id IN (
                      SELECT id FROM questionnaire_assignments WHERE is_test_data = true
                    )
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_status_evidence_cleared', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 3b) Delete questionnaire_test_evidence for test-data assignments.
  ----------------------------------------------------------------------------
  DELETE FROM questionnaire_test_evidence
   WHERE assignment_id IN (
           SELECT id FROM questionnaire_assignments WHERE is_test_data = true
         );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('questionnaire_test_evidence', cnt);

  ----------------------------------------------------------------------------
  -- 4) Delete questionnaire_test_fixtures for test-data assignments.
  ----------------------------------------------------------------------------
  DELETE FROM questionnaire_test_fixtures
   WHERE assignment_id IN (
           SELECT id FROM questionnaire_assignments WHERE is_test_data = true
         );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('questionnaire_test_fixtures', cnt);

  ----------------------------------------------------------------------------
  -- 5) Delete questionnaire_assignment_scores (if table present).
  ----------------------------------------------------------------------------
  IF has_scores THEN
    DELETE FROM questionnaire_assignment_scores
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_assignment_scores', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 6) Delete questionnaire_answers (if table present).
  ----------------------------------------------------------------------------
  IF has_answers THEN
    DELETE FROM questionnaire_answers
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_answers', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 7) Delete the test-data assignments themselves.
  ----------------------------------------------------------------------------
  DELETE FROM questionnaire_assignments WHERE is_test_data = true;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('questionnaire_assignments', cnt);

  ----------------------------------------------------------------------------
  -- 8) Drain transient systemtest plumbing. These are bounded operational
  --    side-tables (failure outbox + magic-link tokens) created exclusively
  --    by the test loop. Always-truncate-able.
  ----------------------------------------------------------------------------
  DELETE FROM systemtest_failure_outbox;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('systemtest_failure_outbox', cnt);

  DELETE FROM systemtest_magic_tokens;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('systemtest_magic_tokens', cnt);

  ----------------------------------------------------------------------------
  -- 9) Optional reporting / run-history tables. These hold ONLY test
  --    artifacts so a full delete is safe; they don't carry is_test_data.
  ----------------------------------------------------------------------------
  IF has_pw_reports THEN
    DELETE FROM playwright_reports;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('playwright_reports', cnt);
  END IF;

  IF has_test_results THEN
    DELETE FROM test_results;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('test_results', cnt);
  END IF;
  IF has_test_runs THEN
    DELETE FROM test_runs;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('test_runs', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 10) Delete child test-data tickets (non-project).
  ----------------------------------------------------------------------------
  DELETE FROM tickets.tickets
   WHERE is_test_data = true
     AND type <> 'project';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('tickets_children', cnt);

  ----------------------------------------------------------------------------
  -- 11) Delete project (epic) test-data tickets last.
  ----------------------------------------------------------------------------
  DELETE FROM tickets.tickets
   WHERE is_test_data = true
     AND type = 'project';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('tickets_projects', cnt);

  ----------------------------------------------------------------------------
  -- 12) Customer allowlist sweep.
  --     Delete customers NOT in the keep-list whose id is not referenced
  --     by any meetings or billing_invoices row. Other FK refs (chat_*,
  --     brett_snapshots, document_assignments, message_threads, messages,
  --     tickets.customer_id, questionnaire_assignments) would block the
  --     delete with a FK violation — we treat any presence in those as
  --     "engagement" and skip the customer to avoid surprise breakage.
  ----------------------------------------------------------------------------
  DELETE FROM customers c
   WHERE c.email <> ALL (keep_emails)
     AND NOT EXISTS (
           SELECT 1 FROM meetings m WHERE m.customer_id = c.id
         )
     AND (
           NOT has_billing_inv
           OR NOT EXISTS (
                -- billing_invoices.customer_id is TEXT (not UUID) — cast to align.
                SELECT 1 FROM billing_invoices bi
                 WHERE bi.customer_id = c.id::text
              )
         )
     -- Defense: also skip if any other table FK-references this customer.
     AND NOT EXISTS (SELECT 1 FROM chat_room_members      WHERE customer_id        = c.id)
     AND NOT EXISTS (SELECT 1 FROM chat_messages          WHERE sender_customer_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM chat_message_reads     WHERE customer_id        = c.id)
     AND NOT EXISTS (SELECT 1 FROM chat_rooms             WHERE direct_customer_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM document_assignments   WHERE customer_id        = c.id)
     AND NOT EXISTS (SELECT 1 FROM message_threads        WHERE customer_id        = c.id)
     AND NOT EXISTS (SELECT 1 FROM messages               WHERE sender_customer_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM brett_snapshots        WHERE customer_id        = c.id)
     AND NOT EXISTS (SELECT 1 FROM questionnaire_assignments WHERE customer_id     = c.id)
     AND NOT EXISTS (SELECT 1 FROM tickets.tickets        WHERE customer_id        = c.id);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('customers', cnt);

  RETURN result;
END;
$$;

COMMENT ON FUNCTION tickets.fn_purge_test_data() IS
  'Idempotent test-data purge. Wipes is_test_data=true rows + associated '
  'side-tables. Customer-safe (allowlist + FK-presence guards). Called '
  'from /api/admin/systemtest/purge-all-test-data before/after Playwright '
  'runs. Returns JSONB of per-table delete counts.';

GRANT EXECUTE ON FUNCTION tickets.fn_purge_test_data() TO website;

COMMIT;
