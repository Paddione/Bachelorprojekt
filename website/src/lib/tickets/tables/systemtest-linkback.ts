// website/src/lib/tickets/tables/systemtest-linkback.ts
// ALTER TABLE … ADD COLUMN IF NOT EXISTS source_test_* (linkback to systemtest).
// Extracted from tickets-db.ts (G-RH01 Batch 2 — T001155). Mirrors the
// canonical owner systemtest/db.ts — we add the columns and unique indexes
// here so a tickets-only init path doesn't break before systemtest/db.ts
// has a chance to install the FKs.
import type { Pool, PoolClient } from 'pg';

export async function applySystemtestLinkback(pool: Pool | PoolClient): Promise<void> {
  // Test-run linkback columns. Mirrored in `systemtest/db.ts` (the canonical
  // owner — that module also installs FKs to test_runs/test_results /
  // questionnaire_questions once those tables exist). We add the columns here
  // too so a tickets-only init path doesn't break: the unique indexes below
  // reference source_test_question_id and source_test_run_id+source_test_id,
  // and on a fresh DB ensureSystemtestSchema has not yet run. The FKs are
  // deferred to ensureSystemtestSchema.
  await pool.query(`
    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS source_test_assignment_id UUID,
      ADD COLUMN IF NOT EXISTS source_test_question_id   UUID,
      ADD COLUMN IF NOT EXISTS source_test_run_id        TEXT,
      ADD COLUMN IF NOT EXISTS source_test_result_id     BIGINT,
      ADD COLUMN IF NOT EXISTS source_test_id            TEXT
  `);
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB, ADD COLUMN IF NOT EXISTS grilling_meta JSONB`);

  // At most one OPEN ticket per failing system-test step. The failure-bridge
  // looks up by source_test_question_id and reuses the existing open row;
  // this index is the defense-in-depth race guard. Closed tickets (done /
  // archived) are excluded so a regression-on-retest can still open a fresh
  // ticket per the original design.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_open_per_test_question_uq
      ON tickets.tickets (source_test_question_id)
      WHERE source_test_question_id IS NOT NULL AND status NOT IN ('done','archived')
  `);

  // Test-run linkback dedup: at most one OPEN ticket per (run_id, test_id).
  // The test-run failure-bridge reuses the existing open ticket; this index
  // is the race guard.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_open_per_test_run_test_uq
      ON tickets.tickets (source_test_run_id, source_test_id)
      WHERE source_test_run_id IS NOT NULL
        AND source_test_id     IS NOT NULL
        AND status NOT IN ('done','archived')
  `);
}
