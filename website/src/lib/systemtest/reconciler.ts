// website/src/lib/systemtest/reconciler.ts
//
// Safety net for the retest trigger (Task 1, db.ts → trg_systemtest_retest).
//
// The trigger fires AFTER UPDATE OF resolution on tickets.tickets and stamps
// `questionnaire_test_status.retest_pending_at` so the failure board moves the
// step into the "retest pending" lane. A few code paths can still bypass it:
//
//   - Replication-style updates that set `session_replication_role = replica`
//     to skip user triggers (used by some restore tooling).
//   - Direct SQL by an operator who DROPs the trigger to fix data, then forgets
//     to re-stamp the status row.
//   - A future migration that briefly drops/recreates the trigger and lets a
//     resolution flip slip through in the gap.
//
// `runReconciler` is an idempotent single-statement UPDATE that catches those
// drifters: any ticket whose `resolution = 'fixed'` AND whose status row still
// has `retest_pending_at IS NULL` gets stamped now. Subsequent calls are
// no-ops because the WHERE clause filters those rows out.
//
// Schema reality (Task 1 adaptation): `questionnaire_test_status` is keyed by
// `question_id` only, so we match on `last_assignment_id` (not `assignment_id`)
// — the same join column the trigger itself uses.

import type { Pool } from 'pg';

export async function runReconciler(pool: Pool): Promise<{ patched: number }> {
  const r = await pool.query(`
    UPDATE questionnaire_test_status qts
       SET retest_pending_at = COALESCE(qts.retest_pending_at, now()),
           retest_attempt    = qts.retest_attempt + 1
      FROM tickets.tickets t
     WHERE t.id = qts.last_failure_ticket_id
       AND t.resolution = 'fixed'
       AND qts.retest_pending_at IS NULL
       AND t.source_test_assignment_id = qts.last_assignment_id
       AND t.source_test_question_id   = qts.question_id
    RETURNING qts.last_assignment_id
  `);
  return { patched: r.rowCount ?? 0 };
}
