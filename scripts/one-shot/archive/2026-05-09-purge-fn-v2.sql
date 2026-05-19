-- 2026-05-09 — Migration: tickets.fn_purge_test_data() v2.
--
-- Adds inbox/message sweeps right before the customers allowlist sweep. The
-- new DELETE blocks gate on `is_test_data = true` (column added in
-- 2026-05-09-inbox-test-data-flag.sql) and feed counts back into the JSONB
-- response, so the bracketing endpoint can confirm rows were actually
-- removed.
--
-- Defensive style identical to v1: probes information_schema for the new
-- column before touching each table so a deploy that runs the function
-- before the column-add migration applies still returns cleanly (with
-- the new keys absent from the count map rather than aborting).
--
-- Ordering note: the customers sweep already runs LAST and re-checks every
-- FK-bearing table (including message_threads, messages). By draining the
-- test-data rows BEFORE the customers sweep we widen the set of stale
-- customers that become removable in the same call — chronologically
-- equivalent to the existing questionnaire_assignments → customers chain.

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
  has_inbox_flag    BOOLEAN;
  has_thread_flag   BOOLEAN;
  has_messages_flag BOOLEAN;
  keep_emails       TEXT[] := ARRAY[
                       'patrick@korczewski.de',
                       'p.korczewski@gmail.com',
                       'quamain@web.de'
                     ];
BEGIN
  -- Probe optional tables / columns.
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
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='inbox_items'
                   AND column_name='is_test_data')
    INTO has_inbox_flag;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='message_threads'
                   AND column_name='is_test_data')
    INTO has_thread_flag;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='messages'
                   AND column_name='is_test_data')
    INTO has_messages_flag;

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
  -- 3a) NULL out questionnaire_test_status.evidence_id refs we're about to
  --     delete.
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
  -- 8) Drain transient systemtest plumbing.
  ----------------------------------------------------------------------------
  DELETE FROM systemtest_failure_outbox;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('systemtest_failure_outbox', cnt);

  DELETE FROM systemtest_magic_tokens;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('systemtest_magic_tokens', cnt);

  ----------------------------------------------------------------------------
  -- 9) Optional reporting / run-history tables.
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
  -- 11b) ── Messaging sweeps (NEW in v2). ───────────────────────────────────
  --     Order: messages → message_threads → inbox_items.
  --
  --     `messages.thread_id` is NOT NULL, so any test-data thread would have
  --     orphan-FK rows if we deleted threads first. inbox_items has no FK
  --     to either, so order between (messages|threads) and inbox_items is
  --     free — keep it last so future cross-table FKs from inbox to threads
  --     stay satisfied.
  ----------------------------------------------------------------------------
  IF has_messages_flag THEN
    DELETE FROM messages WHERE is_test_data = true;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('messages', cnt);
  END IF;

  IF has_thread_flag THEN
    DELETE FROM message_threads WHERE is_test_data = true;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('message_threads', cnt);
  END IF;

  IF has_inbox_flag THEN
    DELETE FROM inbox_items WHERE is_test_data = true;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('inbox_items', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 12) Customer allowlist sweep.
  ----------------------------------------------------------------------------
  DELETE FROM customers c
   WHERE c.email <> ALL (keep_emails)
     AND NOT EXISTS (
           SELECT 1 FROM meetings m WHERE m.customer_id = c.id
         )
     AND (
           NOT has_billing_inv
           OR NOT EXISTS (
                SELECT 1 FROM billing_invoices bi
                 WHERE bi.customer_id = c.id::text
              )
         )
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
  'Idempotent test-data purge. v2 (2026-05-09) extends v1 by sweeping '
  'inbox_items/message_threads/messages WHERE is_test_data=true before the '
  'customers allowlist sweep. Returns JSONB of per-table delete counts.';

GRANT EXECUTE ON FUNCTION tickets.fn_purge_test_data() TO website;

COMMIT;
