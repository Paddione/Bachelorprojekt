// components/website/src/lib/tickets/migrations.ts
// Legacy ALTER TABLE patches + deprecated table + global T-number sequence +
// audit/cycle/lifecycle triggers + fn_purge_test_data + notify_feature_inserted.
// Extracted from tickets-db.ts (G-RH01 Batch 2 — T001155).
import type { Pool, PoolClient } from 'pg';
import { applyTypeVocabularyMigration } from './migrate-type-vocabulary';
import { TICKET_STATUSES } from './status';
import { applyPurgeFunction } from './purge-fn';

export async function applyLegacyMigrations(pool: Pool | PoolClient): Promise<void> {
  // Idempotent column additions for older schema versions where CREATE TABLE IF NOT EXISTS skipped creation
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS type TEXT,
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
  // Status-Vokabular aus ./status.ts (SSOT, T007955): das CHECK-SQL wird aus
  // TICKET_STATUSES gebaut, damit DB-Constraint und Union nie mehr driften
  // (die 11 Werte sind compile-zeitliche Literale, keine Nutzereingabe).
  const statusCheckSql = `CHECK (status IN (${TICKET_STATUSES.map((s) => `'${s}'`).join(',')}))`;
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check ${statusCheckSql}
  `);

  // Typ-Vokabular (T002329): benannter Constraint + Datenmigration bug/feature/task
  // → fix/feat/chore. Ausgelagert, weil diese Datei am S1-Zeilenbudget steht.
  await applyTypeVocabularyMigration(pool);
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

  // Idempotent backfill: a ticket whose external_id is NULL or not in T-format
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

  // tickets.fn_purge_test_data(): Laufzeit-Definition liegt in ./purge-fn.ts (T900381).
  await applyPurgeFunction(pool);

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
    -- Dual-Vokabular (T002329): ohne 'feat' wäre der Trigger nach der
    -- Datenmigration dauerhaft stumm.
    WHEN (NEW.type IN ('feature','feat'))
    EXECUTE FUNCTION tickets.notify_feature_inserted();
  `);
}
