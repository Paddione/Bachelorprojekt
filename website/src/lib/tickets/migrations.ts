// website/src/lib/tickets/migrations.ts
// Legacy ALTER TABLE patches + deprecated table + global T-number sequence +
// audit/cycle/lifecycle triggers + fn_purge_test_data + notify_feature_inserted.
// Extracted from tickets-db.ts (G-RH01 Batch 2 — T001155).
import type { Pool, PoolClient } from 'pg';

export async function applyLegacyMigrations(pool: Pool | PoolClient): Promise<void> {
  // Idempotent column additions for older schema versions where CREATE TABLE IF NOT EXISTS skipped creation
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('bug','feature','task','project')),
      ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS brand TEXT,
      ADD COLUMN IF NOT EXISTS url TEXT,
      ADD COLUMN IF NOT EXISTS thesis_tag TEXT,
      ADD COLUMN IF NOT EXISTS component TEXT
  `);

  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS notes TEXT`);
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false`);

  // Phase 1 Software Factory: touched_files stores the file paths a feature
  // touches, used by the conflict detector to prevent parallel features from
  // editing the same files. pipeline_slot tracks which parallel slot (1-N)
  // this feature occupies. NULL means the feature is queued but not yet
  // assigned to a slot.
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS touched_files TEXT[]`);
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS pipeline_slot INTEGER`);

  // Phase 3 Software Factory: retry_count tracks how many times the pipeline
  // has retried a failed feature. Reset to 0 on slot-claim; >=2 => block +
  // PushNotification (see pipeline.js CI-red handling). [T000413]
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`);

  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS attention_mode TEXT NOT NULL DEFAULT 'auto'
      CHECK (attention_mode IN ('auto', 'ai_ready', 'needs_human'))
  `);

  // Planungsbüro [feature/planungsbuero]: neuer Status 'planning' (kuratierte
  // Vorstufe vor 'backlog'/Laderampe — die Factory rührt ihn nicht an) plus
  // planungskritische Metadaten. Constraint ist inline/unbenannt → drop+add.
  // Kommissionierung [feature/factory-plan-staging]: Status 'plan_staged' — fertige,
  // ausführbereite Pläne warten zwischen Planungsbüro ('planning') und Laderampe
  // ('backlog') auf manuelle Freigabe. Der Dispatcher pollt nur 'backlog' → die
  // Factory rührt 'plan_staged' nicht an. Constraint ist inline/unbenannt → drop+add.
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('triage','planning','plan_staged','backlog','in_progress','in_review','blocked','qa_review','awaiting_deploy','done','archived'))
  `);
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS value_prop    TEXT,
      ADD COLUMN IF NOT EXISTS effort        TEXT,
      ADD COLUMN IF NOT EXISTS areas         TEXT[],
      ADD COLUMN IF NOT EXISTS depends_on    TEXT[],
      ADD COLUMN IF NOT EXISTS planning_rank INTEGER,
      ADD COLUMN IF NOT EXISTS readiness         JSONB, ADD COLUMN IF NOT EXISTS requirements_list TEXT[],
      ADD COLUMN IF NOT EXISTS pinned            BOOLEAN NOT NULL DEFAULT false
  `);
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_effort_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_effort_check
      CHECK (effort IS NULL OR effort IN ('klein','mittel','gross'))
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tickets_planning_idx
    ON tickets.tickets (planning_rank, created_at) WHERE status = 'planning'`);

  // DEPRECATED (T000402): tickets.ticket_counters was a PER-BRAND monotonic
  // counter that fed the external_id trigger. external_id is GLOBALLY unique
  // (see the UNIQUE constraint on tickets.tickets.external_id), so per-brand
  // counters drifted and re-minted the same T-number across brands, violating
  // the constraint and blocking ticket creation. The single source of truth is
  // now the global sequence tickets.external_id_seq (below). The table is kept
  // as inert legacy history; nothing reads or writes it anymore.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_counters (
      brand       TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT PRIMARY KEY,
      last_value  BIGINT NOT NULL DEFAULT 0
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_counters_brand_fkey') THEN
          ALTER TABLE tickets.ticket_counters ADD CONSTRAINT ticket_counters_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
  `);

  // GLOBAL external_id sequence — the single source of truth for T-numbers.
  // `IF NOT EXISTS` adopts the vestigial live sequence if one was created
  // out-of-band, and creates it otherwise. Owned by `website` so later
  // schema-init queries (run as website) can setval it.
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS tickets.external_id_seq AS BIGINT START 1`);
  await pool.query(`ALTER SEQUENCE tickets.external_id_seq OWNER TO website`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_assign_external_id() RETURNS trigger AS $$
    DECLARE
      next_v BIGINT;
    BEGIN
      IF NEW.external_id IS NULL THEN
        next_v := nextval('tickets.external_id_seq');
        NEW.external_id := 'T' || LPAD(next_v::text, 6, '0');
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_tickets_assign_external_id ON tickets.tickets`);
  await pool.query(`
    CREATE TRIGGER trg_tickets_assign_external_id
      BEFORE INSERT ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION tickets.fn_assign_external_id()
  `);

  // Idempotent backfill: any ticket whose external_id is NULL or not in T-format
  // gets a fresh T-number, allocated GLOBALLY above the current global max so it
  // can never collide with an existing id. Ordered by created_at for stable
  // numbering. This only touches NULL / non-T-format rows — it never renumbers a
  // row that already holds a valid T-number.
  await pool.query(`
    WITH to_fill AS (
      SELECT t.id,
             (SELECT COALESCE(MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT)), 0)
                FROM tickets.tickets
               WHERE external_id ~ '^T[0-9]+$')
             + ROW_NUMBER() OVER (ORDER BY t.created_at ASC, t.id ASC) AS new_seq
        FROM tickets.tickets t
       WHERE t.external_id IS NULL OR t.external_id !~ '^T[0-9]+$'
    )
    UPDATE tickets.tickets t
       SET external_id = 'T' || LPAD(f.new_seq::text, 6, '0')
      FROM to_fill f
     WHERE t.id = f.id
  `);

  // Seal the sequence above the current global max so future inserts never
  // re-collide with a backfilled or pre-existing id. Idempotent: setval to the
  // observed max on every boot is a no-op once the sequence is already ahead.
  // NOTE (T000402): historical cross-brand DUPLICATE external_ids that already
  // hold valid T-numbers (e.g. T000342/T000399/T000402) are NOT reconciled here
  // — that renumber touches live, externally-referenced ids and is a separate
  // one-shot manual migration. See the PR's HELD-FOR-REVIEW section.
  //
  // MONOTONIC-ONLY (T001392): this reseed runs on EVERY schema-init (every
  // website pod boot/rollout), not just once. `MAX(external_id)` is read in
  // its own transaction and — under read-committed isolation — is blind to a
  // concurrent, not-yet-committed nextval()-derived INSERT (e.g. a running
  // `scripts/ticket.sh create`). An unconditional setval() to that MAX would
  // regress the sequence backward, and the next nextval() call would then
  // re-issue an external_id already handed out (but not yet committed) by the
  // concurrent insert, producing a `tickets_external_id_key` violation once
  // both commit. GREATEST() over the table's observed max AND the sequence's
  // own current last_value makes the reseed advance-only: it can never lower
  // last_value below what nextval() has already dispensed, so a value in
  // flight can never be reissued. Verified against a real Postgres 16
  // instance (see docs/superpowers/specs/2026-07-01-t001392-ticket-external-id-race-design.md).
  await pool.query(`
    SELECT setval('tickets.external_id_seq',
                  GREATEST(
                    COALESCE((SELECT MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT))
                                FROM tickets.tickets
                               WHERE external_id ~ '^T[0-9]+$'), 1),
                    (SELECT last_value FROM tickets.external_id_seq)
                  ),
                  EXISTS (SELECT 1 FROM tickets.tickets WHERE external_id ~ '^T[0-9]+$'))
  `);

  await pool.query(`
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
      -- 6b) ── questionnaire_templates sweep (NEW in v4 / Gap 2). ───────────────
      --     fa-fragebogen.spec.ts INSERTs templates with title 'e2e-*' and
      --     deletes them in afterAll — but a crash leaves them permanently.
      --     Sweep here, before assignments (7), so any FK from assignment →
      --     template is already resolved.
      ----------------------------------------------------------------------------
      DELETE FROM questionnaire_templates WHERE title LIKE 'e2e-%';
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('questionnaire_templates', cnt);

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
      -- 9b) ── Unmarked-canonical-identity sweep (NEW in v5 / T001453). ─────────
      --     E2E runs without CRON_SECRET (missing repo secret, local runs)
      --     historically created rows with is_test_data=false. We re-mark rows
      --     whose identity can ONLY come from the test suite, then let the
      --     regular flag-based deletes below sweep them:
      --       - reporter/contact emails under RFC-2606-reserved domains
      --         (example.com/.org/.net, .invalid TLD) — undeliverable, never a
      --         reachable real user;
      --       - the canonical fixture name '[TEST] E2E User' (fa-10 T6);
      --       - bug tickets titled by fa-bugs-notifications.
      ----------------------------------------------------------------------------
      UPDATE tickets.tickets
         SET is_test_data = true
       WHERE is_test_data = false
         AND (
               reporter_email ~* '@example\\.(com|org|net|invalid)$'
            OR reporter_email ~* '\\.invalid$'
            OR title LIKE 'E2E notification test — Playwright%'
             );
      GET DIAGNOSTICS cnt = ROW_COUNT;
      result := result || jsonb_build_object('tickets_remarked_unmarked', cnt);

      IF has_inbox_flag THEN
        UPDATE inbox_items
           SET is_test_data = true
         WHERE is_test_data = false
           AND (
                 payload->>'email' ~* '@example\\.(com|org|net|invalid)$'
              OR payload->>'email' ~* '\\.invalid$'
              OR payload->>'name'  =  '[TEST] E2E User'
               );
        GET DIAGNOSTICS cnt = ROW_COUNT;
        result := result || jsonb_build_object('inbox_remarked_unmarked', cnt);
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
  `);

  await pool.query(`COMMENT ON FUNCTION tickets.fn_purge_test_data() IS 'Idempotent test-data purge. v5 (2026-07-02, T001453): re-marks unmarked canonical E2E identities (RFC-2606 mails, [TEST] E2E User) before the flag sweeps'`);
  await pool.query(`GRANT EXECUTE ON FUNCTION tickets.fn_purge_test_data() TO website`);

  // ── INERT future plumbing: pg_notify on new feature tickets ─────────────────
  // Spec §6 Phase 2 (correction A2): NOT CONSUMED in Phase 3. The data plane is
  // one-shot `kubectl exec … psql` (lib.sh:31-35); a LISTEN needs a held
  // connection (cf. dispatcher.js:15). The Cron-poll (schedule.sh, every timer
  // tick) IS the trigger. This NOTIFY exists only so a future long-lived consumer
  // can be wired without a schema change. Idempotent: safe per-pod-boot, both brands.
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('factory_feature_inserted', NEW.external_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_notify_feature_inserted ON tickets.tickets;
  `);
  await pool.query(`
    CREATE TRIGGER trg_notify_feature_inserted
    AFTER INSERT ON tickets.tickets
    FOR EACH ROW
    WHEN (NEW.type = 'feature')
    EXECUTE FUNCTION tickets.notify_feature_inserted();
  `);
}
