-- 2026-08-09 — Migration: tickets.fn_purge_test_data() v8 (T002894).
--
-- Adds `to_regclass` existence guards for all questionnaire tables
-- (questionnaire_test_status, questionnaire_assignments, questionnaire_test_evidence,
-- questionnaire_test_fixtures, questionnaire_templates) and systemtest tables
-- (systemtest_failure_outbox, systemtest_magic_tokens) that are absent on the
-- local k3d dev shared-db (schema drift vs. fleet). Without these guards,
-- unconditional DELETE/UPDATE statements throw before any sweep runs, so
-- purge_factory_test_data() silently purges nothing. Also tightens existing
-- has_src_assn_col/has_qts_evidence/has_scores/has_answers guards to additionally
-- check has_assignments, so subqueries referencing the missing table are skipped.
--
-- All other steps are identical to v7.

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
  has_qts           BOOLEAN;
  has_assignments   BOOLEAN;
  has_test_evidence BOOLEAN;
  has_test_fixtures BOOLEAN;
  has_templates     BOOLEAN;
  has_systest_out   BOOLEAN;
  has_systest_tok   BOOLEAN;
  has_inbox_flag    BOOLEAN;
  has_thread_flag   BOOLEAN;
  has_messages_flag BOOLEAN;
  has_coaching_flag BOOLEAN;
  has_is_test_data  BOOLEAN;
  cust_sql          TEXT;
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
 SELECT to_regclass('questionnaire_test_status') IS NOT NULL INTO has_qts;
 SELECT to_regclass('questionnaire_assignments') IS NOT NULL INTO has_assignments;
 SELECT to_regclass('questionnaire_test_evidence') IS NOT NULL INTO has_test_evidence;
 SELECT to_regclass('questionnaire_test_fixtures') IS NOT NULL INTO has_test_fixtures;
 SELECT to_regclass('questionnaire_templates') IS NOT NULL INTO has_templates;
 SELECT to_regclass('systemtest_failure_outbox') IS NOT NULL INTO has_systest_out;
 SELECT to_regclass('systemtest_magic_tokens') IS NOT NULL INTO has_systest_tok;
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
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='coaching'
                   AND table_name='sessions'
                   AND column_name='is_test_data')
    INTO has_coaching_flag;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='tickets'
                   AND table_name='tickets'
                   AND column_name='is_test_data')
    INTO has_is_test_data;

  ----------------------------------------------------------------------------
  -- 1) Clear FK from questionnaire_test_status to test-data tickets.
  ----------------------------------------------------------------------------
  IF has_qts THEN
    UPDATE questionnaire_test_status
       SET last_failure_ticket_id = NULL
     WHERE last_failure_ticket_id IN (
             SELECT id FROM tickets.tickets WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_status_cleared', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 2) Null out tickets.source_test_assignment_id refs to test assignments.
  ----------------------------------------------------------------------------
  IF has_src_assn_col AND has_assignments THEN
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
  IF has_qts_evidence AND has_qts AND has_test_evidence AND has_assignments THEN
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
  IF has_test_evidence AND has_assignments THEN
    DELETE FROM questionnaire_test_evidence
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_evidence', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 4) Delete questionnaire_test_fixtures for test-data assignments.
  ----------------------------------------------------------------------------
  IF has_test_fixtures AND has_assignments THEN
    DELETE FROM questionnaire_test_fixtures
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_test_fixtures', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 5) Delete questionnaire_assignment_scores (if table present).
  ----------------------------------------------------------------------------
  IF has_scores AND has_assignments THEN
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
  IF has_answers AND has_assignments THEN
    DELETE FROM questionnaire_answers
     WHERE assignment_id IN (
             SELECT id FROM questionnaire_assignments WHERE is_test_data = true
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_answers', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 6b) ── questionnaire_templates sweep (NEW in v4 / Gap 2). ───────────────
  --     fa-fragebogen.spec.ts INSERTs templates with title 'e2e-*' and
  --     deletes them in afterAll — but a crash leaves them permanently.
  --     Sweep here, before assignments (7), so any FK from assignment →
  --     template is already resolved.
  ----------------------------------------------------------------------------
  IF has_templates THEN
    DELETE FROM questionnaire_templates WHERE title LIKE 'e2e-%';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_templates', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 7) Delete the test-data assignments themselves.
  ----------------------------------------------------------------------------
  IF has_assignments THEN
    DELETE FROM questionnaire_assignments WHERE is_test_data = true;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('questionnaire_assignments', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 8) Drain transient systemtest plumbing.
  ----------------------------------------------------------------------------
  IF has_systest_out THEN
    DELETE FROM systemtest_failure_outbox;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('systemtest_failure_outbox', cnt);
  END IF;

  IF has_systest_tok THEN
    DELETE FROM systemtest_magic_tokens;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('systemtest_magic_tokens', cnt);
  END IF;

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
  -- 9b) ── Unmarked-canonical-identity sweep (NEW in v5 / T001453). ──────────
  --     Re-mark unmarked rows with suite-only identities, then let the
  --     flag-based deletes below sweep them.
  ----------------------------------------------------------------------------
  UPDATE tickets.tickets
     SET is_test_data = true
   WHERE is_test_data = false
     AND (
           reporter_email ~* '@example\.(com|org|net|invalid)$'
        OR reporter_email ~* '\.invalid$'
        OR title LIKE 'E2E notification test — Playwright%'
         );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('tickets_remarked_unmarked', cnt);

  IF has_inbox_flag THEN
    UPDATE inbox_items
       SET is_test_data = true
     WHERE is_test_data = false
       AND (
             payload->>'email' ~* '@example\.(com|org|net|invalid)$'
          OR payload->>'email' ~* '\.invalid$'
          OR payload->>'name'  =  '[TEST] E2E User'
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('inbox_remarked_unmarked', cnt);
  END IF;

  IF has_coaching_flag THEN
    UPDATE coaching.sessions
       SET is_test_data = true
     WHERE is_test_data = false
       AND (
             title LIKE 'FA-%'
          OR title LIKE 'e2e-%'
          OR title LIKE '%E2E%'
          OR title LIKE 'Session E2E%'
           );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('coaching_sessions_remarked', cnt);
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
  -- 11b) Messaging sweeps.
  --     Order: messages → message_threads → inbox_items.
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
  -- 11c) Knowledge Collections test data sweep.
  ----------------------------------------------------------------------------
  DELETE FROM knowledge.collections WHERE name LIKE 'e2e-crawl-%' OR name LIKE 'e2e-webcrawl-%' OR name LIKE 'e2e-%';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('knowledge_collections', cnt);

  ----------------------------------------------------------------------------
  -- 11d) ── Meetings sweep (NEW in v4 / Gap 1). ─────────────────────────────
  --     booking-flow.ts seeds meetings with meeting_type '[TEST] systemtest-
  --     booking'. These are tracked as fixtures but NOT deleted by the bracket
  --     because fn_purge_test_data had no meetings step — only the hourly
  --     CronJob could reach them. Meanwhile the customer allowlist sweep
  --     (step 12) guards with NOT EXISTS (meetings WHERE customer_id = c.id),
  --     so test customers also leaked.
  --     Fix: sweep meetings by meeting_type LIKE '[TEST]%' before customers.
  ----------------------------------------------------------------------------
  IF has_meetings THEN
    DELETE FROM meetings WHERE meeting_type LIKE '[TEST]%';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('meetings', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 11e) ── Coaching sessions sweep (NEW in v6 / T001638). ──────────────────
  --     coaching.sessions.is_test_data flags seed/E2E-created sessions.
  --     Guarded by has_coaching_flag: the function may be (re)created before
  --     the 2026-07-08 column migration ran — an unguarded sweep would then
  --     abort the whole purge. Delete child steps first (explicit, for an
  --     auditable count), then the parent sessions.
  ----------------------------------------------------------------------------
  IF has_coaching_flag THEN
    DELETE FROM coaching.session_steps
     USING coaching.sessions s
     WHERE session_id = s.id AND s.is_test_data;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('coaching_session_steps', cnt);

    DELETE FROM coaching.sessions WHERE is_test_data;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    result := result || jsonb_build_object('coaching_sessions', cnt);
  END IF;

  ----------------------------------------------------------------------------
  -- 12) Customer allowlist sweep.
  --
  --     Dynamisch zusammengesetzt (T002894). Ein fehlendes optionales Relation
  --     laesst sich NICHT per Boolescher Kurzschluss-Bedingung entschaerfen —
  --     die frueher hier stehende Form
  --         AND (NOT has_billing_inv OR NOT EXISTS (SELECT 1 FROM billing_invoices ...))
  --     hat nie geschuetzt: PostgreSQL loest Relationsnamen beim Parsen/Planen
  --     auf, also BEVOR irgendein Boolescher Ausdruck ausgewertet wird. Fehlt
  --     die Tabelle, scheitert das Statement mit
  --     `relation "billing_invoices" does not exist`, unabhaengig vom Wert von
  --     has_billing_inv. Der Guard muss deshalb den TEXT des Statements
  --     steuern, nicht seinen Wahrheitswert.
  --
  --     Weglassen ist semantisch exakt: existiert die Tabelle nicht, kann kein
  --     Kunde eine Zeile darin haben, die NOT EXISTS-Bedingung waere ohnehin
  --     TRUE, und `TRUE AND x` ist `x`. Der Sweep wird durch das Weglassen also
  --     nicht aggressiver — was hier zaehlt, weil das Statement `customers`
  --     loescht.
  ----------------------------------------------------------------------------
  cust_sql :=
    'DELETE FROM customers c'
    || ' WHERE c.email <> ALL ($1)'
    || '   AND NOT EXISTS (SELECT 1 FROM meetings m           WHERE m.customer_id      = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_room_members    WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_messages        WHERE sender_customer_id = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_message_reads   WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM chat_rooms           WHERE direct_customer_id = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM document_assignments WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM message_threads      WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM messages             WHERE sender_customer_id = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM brett_snapshots      WHERE customer_id        = c.id)'
    || '   AND NOT EXISTS (SELECT 1 FROM tickets.tickets      WHERE customer_id        = c.id)';

  IF has_billing_inv THEN
    cust_sql := cust_sql
      || '   AND NOT EXISTS (SELECT 1 FROM billing_invoices bi WHERE bi.customer_id = c.id::text)';
  END IF;

  IF has_assignments THEN
    cust_sql := cust_sql
      || '   AND NOT EXISTS (SELECT 1 FROM questionnaire_assignments WHERE customer_id = c.id)';
  END IF;

  EXECUTE cust_sql USING keep_emails;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('customers', cnt);

  RETURN result;
END;
$$;

COMMENT ON FUNCTION tickets.fn_purge_test_data() IS
  'Idempotent test-data purge. v8 (2026-08-09, T002894): adds to_regclass guards for all tables absent on local k3d dev (questionnaire + systemtest schemas — 7 tables).';

GRANT EXECUTE ON FUNCTION tickets.fn_purge_test_data() TO website;

COMMIT;
