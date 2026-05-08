// website/src/lib/systemtest/cleanup.ts
//
// Background cleanup helpers for the system-test failure loop. These run on
// CronJob schedules (see k3d/cronjob-systemtest-cleanup.yaml) to keep the
// system from accumulating fixtures, expired magic-link tokens, or stuck
// outbox rows over time.
//
// Three exported functions:
//
//   - purgeFixturesFor(pool, opts)
//       Hourly fixture sweep. For each assignment that has reached a terminal
//       lifecycle state (submitted | reviewed | archived | dismissed) and is
//       older than `graceHours`, walks `questionnaire_test_fixtures` and
//       deletes the corresponding rows.
//
//   - drainOutbox(pool)
//       Every-5-minute drain of `systemtest_failure_outbox`. Picks up rows
//       whose `retry_after` has elapsed and re-tries `openFailureTicket`. On
//       success the outbox row is deleted; on failure `retry_count` is bumped
//       and `retry_after` is moved out 5 minutes. Rows hitting the 12-retry
//       budget are left in place so admins can inspect them via the board.
//
//   - purgeExpiredMagicTokens(pool)
//       Sub-helper for the hourly cron. Deletes used / expired rows from
//       `systemtest_magic_tokens`. Lives here (not in `auth/magic-link.ts`)
//       so the failure-loop cron job has a single import surface.
//
// Design constraints:
//   - Per-row failures NEVER abort the whole sweep. Each row records its
//     error in `purge_error` and we move on. The cron exits 0 unless something
//     truly catastrophic happens (e.g. pool is unreachable).
//   - Defense-in-depth on `is_test_data`: tables that have an `is_test_data`
//     column refuse to delete rows where it's false, even if a fixture row
//     somehow tracked them. Two tables (`customers`, `meetings`) do NOT have
//     that column — the seed modules created those rows exclusively for the
//     test, so deleting by id is safe. The ALLOWED_TABLES set caps the surface
//     so a stray fixture row pointing at a random table can't trigger any
//     DELETE we didn't intend.

import type { Pool } from 'pg';

import * as keycloak from '../keycloak';
import { openFailureTicket } from './failure-bridge';
import { openTestRunFailureTicket } from './test-run-bridge';

/**
 * The full set of tables the cleanup CronJob is allowed to touch via fixture
 * rows. Anything else is treated as an unknown row type and recorded as a
 * `purge_error` so an operator can inspect.
 *
 * Notes on individual entries:
 *   - `auth.users` / `bookings.bookings` are legacy; some envs may carry them
 *     because earlier prototypes seeded them. Both have `is_test_data` columns
 *     when present (see `ensureSystemtestSchema`).
 *   - `keycloak.users` is a virtual marker — the actual user lives in Keycloak
 *     itself. `purgeFixturesFor` calls `keycloak.deleteUser(rowId)` for these.
 *   - `tickets.tickets` is rare but valid (a seed module may insert a bug-
 *     ticket fixture; see `coaching-project.ts`). Has `is_test_data`.
 *   - `questionnaire_assignments` has `is_test_data`.
 *   - `customers` and `meetings` do NOT have `is_test_data`. The seed modules
 *     unconditionally insert these rows for the test only, so deleting by id
 *     alone is safe. See booking-flow.ts / coaching-project.ts.
 */
const ALLOWED_TABLES = new Set<string>([
  'auth.users',
  'keycloak.users',
  'bookings.bookings',
  'tickets.tickets',
  'questionnaire_assignments',
  'customers',
  'meetings',
]);

/**
 * Tables WITH an `is_test_data` BOOLEAN column. Rows here are deleted with a
 * defensive WHERE so a misrecorded fixture pointing at a real row cannot delete
 * it. (The corresponding seed module is responsible for inserting with
 * is_test_data=true; if that step were ever skipped, the cleanup quietly
 * does nothing and surfaces the issue as `purge_error`.)
 */
const TABLES_WITH_TEST_DATA_FLAG = new Set<string>([
  'auth.users',
  'bookings.bookings',
  'tickets.tickets',
  'questionnaire_assignments',
]);

interface FixtureRow {
  id: string;
  table_name: string;
  row_id: string;
}

export interface PurgeFixturesOpts {
  /** Minimum age (in hours) of the assignment's terminal-state timestamp
   *  before its fixtures become eligible for deletion. Default 24h. */
  graceHours: number;
}

export interface PurgeFixturesResult {
  /** Count of fixture rows that were marked `purged_at` (DB row deleted or
   *  Keycloak user deleted). */
  purged: number;
  /** Count of fixture rows that hit a per-row error and were skipped. The
   *  error is persisted in `purge_error` for inspection. */
  errors: number;
}

/**
 * Sweep fixtures for assignments that have reached a terminal lifecycle state
 * and are older than `graceHours`. Idempotent — fixture rows already marked
 * `purged_at` are skipped.
 *
 * Per-row errors are caught and recorded in `purge_error`; they do NOT abort
 * the whole sweep. Re-running the cron will retry those rows on the next tick
 * (we do NOT short-circuit on `purge_error IS NOT NULL` so transient failures
 * eventually drain).
 */
export async function purgeFixturesFor(
  pool: Pool,
  opts: PurgeFixturesOpts,
): Promise<PurgeFixturesResult> {
  // Pick up fixtures whose owning assignment has reached a terminal state and
  // whose state-stamp is older than `graceHours`. The four terminal stamps
  // (submitted_at, reviewed_at, archived_at, dismissed_at) are all eligible —
  // we use COALESCE'd MAX of whichever is set so an archived-after-submission
  // assignment uses the most recent state stamp.
  const due = await pool.query<FixtureRow>(
    `SELECT f.id, f.table_name, f.row_id
       FROM questionnaire_test_fixtures f
       JOIN questionnaire_assignments a ON a.id = f.assignment_id
      WHERE f.purged_at IS NULL
        AND a.status IN ('submitted','reviewed','archived','dismissed')
        AND COALESCE(a.dismissed_at, a.archived_at, a.reviewed_at, a.submitted_at)
            < now() - ($1 || ' hours')::interval`,
    [opts.graceHours],
  );

  let purged = 0;
  let errors = 0;
  for (const row of due.rows) {
    try {
      await purgeOneFixture(pool, row);
      await pool.query(
        `UPDATE questionnaire_test_fixtures
            SET purged_at = now(),
                purge_error = NULL
          WHERE id = $1`,
        [row.id],
      );
      purged++;
    } catch (e) {
      errors++;
      const msg = (e as Error)?.message ?? String(e);
      // Best-effort: persist the error for visibility. Failure to persist the
      // error itself must NOT crash the cron — swallow it.
      await pool.query(
        `UPDATE questionnaire_test_fixtures
            SET purge_error = $2
          WHERE id = $1`,
        [row.id, msg.slice(0, 4000)],
      ).catch(() => {});
    }
  }

  return { purged, errors };
}

/** Internal: delete the underlying row for one fixture. Throws on any
 *  unexpected condition so the caller can record the error. */
async function purgeOneFixture(pool: Pool, row: FixtureRow): Promise<void> {
  if (!ALLOWED_TABLES.has(row.table_name)) {
    throw new Error(`table not in ALLOWED_TABLES: ${row.table_name}`);
  }

  // Virtual marker — the actual user lives in Keycloak, not Postgres.
  if (row.table_name === 'keycloak.users') {
    const ok = await keycloak.deleteUser(row.row_id);
    if (!ok) throw new Error(`keycloak.deleteUser(${row.row_id}) returned false`);
    return;
  }

  if (TABLES_WITH_TEST_DATA_FLAG.has(row.table_name)) {
    // Defense-in-depth: only delete when the row was tagged is_test_data.
    // The seed modules always insert with is_test_data=true; a row missing
    // that flag is surfaced as a no-op + `purge_error` so it gets investigated
    // rather than silently treated as deleted.
    const r = await pool.query(
      `DELETE FROM ${row.table_name} WHERE id = $1 AND is_test_data = true`,
      [row.row_id],
    );
    if ((r.rowCount ?? 0) === 0) {
      throw new Error(
        `no row deleted from ${row.table_name} (id=${row.row_id} missing or is_test_data=false)`,
      );
    }
    return;
  }

  // Tables without `is_test_data` (customers, meetings). The seed module
  // inserted them exclusively for the test, so a delete-by-id is safe.
  // Idempotency: rowCount=0 is OK here — it just means an earlier sweep
  // already deleted the row (or cascade got it). We don't throw.
  await pool.query(`DELETE FROM ${row.table_name} WHERE id = $1`, [row.row_id]);
}

export interface DrainOutboxResult {
  /** Number of due rows we attempted to retry. */
  retried: number;
  /** Number of those that succeeded (ticket created → outbox row deleted). */
  succeeded: number;
}

/**
 * Drain the failure-bridge outbox. Picks up rows with `retry_after <= now()`
 * and `retry_count < 12`, re-invokes `openFailureTicket`, and:
 *   - on success: deletes the outbox row.
 *   - on failure: bumps retry_count, pushes retry_after out 5 minutes,
 *     records last_error.
 *
 * Rows that have hit retry_count = 12 are left in place — they show up as
 * `undelivered` on the failure board (Task 7 / `board.ts`) so admins can
 * intervene.
 */
export async function drainOutbox(pool: Pool): Promise<DrainOutboxResult> {
  const due = await pool.query<{
    id: string;
    source_kind: string | null;
    assignment_id: string | null;
    question_id: string | null;
    run_id: string | null;
    test_id: string | null;
    test_result_id: number | null;
    test_name: string | null;
    error_message: string | null;
    file_path: string | null;
  }>(
    `SELECT id, source_kind, assignment_id, question_id,
            run_id, test_id, test_result_id, test_name, error_message, file_path
       FROM systemtest_failure_outbox
      WHERE retry_after <= now()
        AND retry_count < 12
      ORDER BY retry_after
      LIMIT 50`,
  );

  let succeeded = 0;
  for (const row of due.rows) {
    try {
      // source_kind is NOT NULL with default 'questionnaire' — but pre-migration
      // rows carried no value, so we route on that default.
      if (row.source_kind === 'test_run' && row.run_id && row.test_id) {
        await openTestRunFailureTicket(pool, {
          runId: row.run_id,
          testId: row.test_id,
          resultId: row.test_result_id ?? null,
          name: row.test_name ?? row.test_id,
          error: row.error_message,
          filePath: row.file_path,
        });
      } else if (row.assignment_id && row.question_id) {
        await openFailureTicket(pool, {
          assignmentId: row.assignment_id,
          questionId: row.question_id,
        });
      } else {
        // Malformed row — skip rather than retry forever.
        await pool.query(
          `UPDATE systemtest_failure_outbox
              SET retry_count = 12,
                  last_error  = 'malformed: missing key columns'
            WHERE id = $1`,
          [row.id],
        );
        continue;
      }
      await pool.query(`DELETE FROM systemtest_failure_outbox WHERE id = $1`, [row.id]);
      succeeded++;
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await pool.query(
        `UPDATE systemtest_failure_outbox
            SET retry_count = retry_count + 1,
                retry_after = now() + interval '5 minutes',
                last_error  = $2
          WHERE id = $1`,
        [row.id, msg.slice(0, 4000)],
      );
    }
  }

  return { retried: due.rowCount ?? 0, succeeded };
}

export interface PurgeMagicTokensResult {
  purged: number;
}

/**
 * Sweep used + expired magic-link tokens. Called by the hourly cleanup cron
 * (a few hundred rows per day at most, so we don't bother batching).
 */
export async function purgeExpiredMagicTokens(pool: Pool): Promise<PurgeMagicTokensResult> {
  const r = await pool.query(
    `DELETE FROM systemtest_magic_tokens
      WHERE expires_at < now() OR used_at IS NOT NULL`,
  );
  return { purged: r.rowCount ?? 0 };
}
