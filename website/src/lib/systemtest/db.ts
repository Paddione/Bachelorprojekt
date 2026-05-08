import type { Pool } from 'pg';

/**
 * Idempotent bootstrap for the system-test failure-loop schema.
 *
 * Creates evidence/seed-registry/fixture/outbox tables, adds back-ref
 * columns to questionnaire_test_status and tickets.tickets, installs the
 * v_systemtest_failure_board view, and the retest trigger on tickets.tickets.
 *
 * Designed to be called from existing schema bootstrap paths
 * (see questionnaire-db.ts initDb()). All statements use IF NOT EXISTS /
 * OR REPLACE / DO-block guards so repeated invocations are safe.
 */
export async function ensureSystemtestSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_test_evidence (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id   UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      question_id     UUID NOT NULL REFERENCES questionnaire_questions(id),
      attempt         INT NOT NULL DEFAULT 0,
      replay_path     TEXT,
      partial         BOOLEAN NOT NULL DEFAULT false,
      console_log     JSONB,
      network_log     JSONB,
      recorded_from   TIMESTAMPTZ,
      recorded_to     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_evidence_assignment_question
      ON questionnaire_test_evidence(assignment_id, question_id, attempt);

    CREATE TABLE IF NOT EXISTS questionnaire_test_seed_registry (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id  UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
      question_id  UUID REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      seed_module  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_registry_scope
      ON questionnaire_test_seed_registry
         (template_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid));

    CREATE TABLE IF NOT EXISTS questionnaire_test_fixtures (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      question_id   UUID NOT NULL REFERENCES questionnaire_questions(id),
      attempt       INT NOT NULL,
      table_name    TEXT NOT NULL,
      row_id        UUID NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      purged_at     TIMESTAMPTZ,
      purge_error   TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_fixtures_unpurged
      ON questionnaire_test_fixtures(assignment_id) WHERE purged_at IS NULL;

    CREATE TABLE IF NOT EXISTS systemtest_failure_outbox (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL,
      question_id   UUID NOT NULL,
      attempt       INT NOT NULL,
      last_error    TEXT,
      retry_count   INT NOT NULL DEFAULT 0,
      retry_after   TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Magic-link table for system-test seeded sessions. We keep this table in
    -- the public schema (the dedicated auth schema does not exist in this
    -- codebase -- Keycloak owns user accounts). The cleanup CronJob (Task 8)
    -- prunes expired/used rows on a schedule independent of fixture purging.
    -- Note: column is "session_payload" (not "session_user"). PostgreSQL
    -- treats SESSION_USER as a reserved-word function, so an unquoted column
    -- with that name fails parsing. Renamed during Task 5 to keep the
    -- schema bootstrap idempotent on a fresh DB.
    CREATE TABLE IF NOT EXISTS systemtest_magic_tokens (
      token         TEXT PRIMARY KEY,
      keycloak_user_id UUID NOT NULL,
      session_payload JSONB NOT NULL,
      redirect_uri  TEXT NOT NULL,
      expires_at    TIMESTAMPTZ NOT NULL,
      used_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_magic_tokens_unused
      ON systemtest_magic_tokens(expires_at) WHERE used_at IS NULL;
  `);

  // Idempotent column additions on existing tables. Done in a separate
  // statement so column adds are safe even on a fresh DB where the
  // referenced tables (questionnaire_test_evidence, tickets.tickets) may
  // not yet have all FK targets in place.
  await pool.query(`
    ALTER TABLE questionnaire_test_status
      ADD COLUMN IF NOT EXISTS evidence_id            UUID,
      ADD COLUMN IF NOT EXISTS last_failure_ticket_id UUID,
      ADD COLUMN IF NOT EXISTS retest_pending_at      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS retest_attempt         INT NOT NULL DEFAULT 0;

    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS source_test_assignment_id UUID,
      ADD COLUMN IF NOT EXISTS source_test_question_id   UUID;
  `);

  // is_test_data columns: defense-in-depth marker for seeded fixtures so
  // they never leak into customer-facing reads. auth.users / bookings.bookings
  // are guarded with DO blocks because those schemas may not exist in every
  // environment (e.g. fresh CI DB). tickets.tickets and questionnaire_assignments
  // are unconditional — Task 1 already required them.
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='users') THEN
        ALTER TABLE auth.users
          ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
        CREATE INDEX IF NOT EXISTS ix_auth_users_test_data
          ON auth.users(is_test_data) WHERE is_test_data = true;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='bookings' AND table_name='bookings') THEN
        ALTER TABLE bookings.bookings
          ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
        CREATE INDEX IF NOT EXISTS ix_bookings_test_data
          ON bookings.bookings(is_test_data) WHERE is_test_data = true;
      END IF;
    END$$;

    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS ix_tickets_test_data
      ON tickets.tickets(is_test_data) WHERE is_test_data = true;

    ALTER TABLE questionnaire_assignments
      ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
  `);

  // Foreign keys added separately, guarded by pg_constraint look-up so
  // repeated calls don't error.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qts_evidence_id_fk') THEN
        ALTER TABLE questionnaire_test_status
          ADD CONSTRAINT qts_evidence_id_fk
          FOREIGN KEY (evidence_id) REFERENCES questionnaire_test_evidence(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qts_failure_ticket_fk') THEN
        ALTER TABLE questionnaire_test_status
          ADD CONSTRAINT qts_failure_ticket_fk
          FOREIGN KEY (last_failure_ticket_id) REFERENCES tickets.tickets(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_source_assignment_fk') THEN
        ALTER TABLE tickets.tickets
          ADD CONSTRAINT tickets_source_assignment_fk
          FOREIGN KEY (source_test_assignment_id) REFERENCES questionnaire_assignments(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_source_question_fk') THEN
        ALTER TABLE tickets.tickets
          ADD CONSTRAINT tickets_source_question_fk
          FOREIGN KEY (source_test_question_id) REFERENCES questionnaire_questions(id);
      END IF;
    END$$;
  `);

  await pool.query(`
    CREATE OR REPLACE VIEW v_systemtest_failure_board AS
    SELECT
      qts.last_assignment_id AS assignment_id,
      qts.question_id,
      qts.last_result,
      qts.last_result_at,
      qts.retest_pending_at,
      qts.retest_attempt,
      qts.evidence_id,
      qts.last_failure_ticket_id,
      t.id              AS ticket_id,
      t.external_id     AS ticket_external_id,
      t.status          AS ticket_status,
      t.resolution      AS ticket_resolution,
      fix_links.pr_number,
      pr.merged_at      AS pr_merged_at,
      CASE
        WHEN qts.last_result = 'erfüllt'
             AND qts.last_result_at >= now() - INTERVAL '7 days'
             THEN 'green'
        WHEN qts.retest_pending_at IS NOT NULL
             THEN 'retest_pending'
        WHEN fix_links.pr_number IS NOT NULL AND pr.merged_at IS NULL
             THEN 'fix_in_pr'
        WHEN t.id IS NOT NULL
             THEN 'open'
        ELSE NULL
      END AS column_key
    FROM questionnaire_test_status qts
    LEFT JOIN tickets.tickets t ON t.id = qts.last_failure_ticket_id
    LEFT JOIN LATERAL (
      SELECT pr_number FROM tickets.ticket_links
      WHERE from_id = t.id AND kind IN ('fixes','fixed_by') AND pr_number IS NOT NULL
      ORDER BY pr_number DESC LIMIT 1
    ) fix_links ON true
    LEFT JOIN tickets.pr_events pr ON pr.pr_number = fix_links.pr_number
    WHERE qts.last_failure_ticket_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION trg_systemtest_retest() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.resolution = 'fixed'
         AND (OLD.resolution IS DISTINCT FROM 'fixed')
         AND NEW.source_test_assignment_id IS NOT NULL THEN
        UPDATE questionnaire_test_status
           SET retest_pending_at = now(),
               retest_attempt    = retest_attempt + 1
         WHERE last_assignment_id = NEW.source_test_assignment_id
           AND question_id        = NEW.source_test_question_id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tickets_resolution_retest ON tickets.tickets;
    CREATE TRIGGER tickets_resolution_retest
      AFTER UPDATE OF resolution ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION trg_systemtest_retest();
  `);
}
