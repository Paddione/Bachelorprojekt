// website/src/lib/systemtest/reconciler.test.ts
//
// DB-gated tests for `runReconciler` — the safety net that catches
// resolution=fixed updates which bypassed the retest trigger.
//
// We bypass the trigger via `session_replication_role = replica` when allowed
// (PostgreSQL requires superuser), and fall back to a DROP TRIGGER → UPDATE →
// CREATE TRIGGER dance otherwise. Both achieve the same "the trigger did not
// fire on this UPDATE" state, which is exactly what the reconciler is meant
// to repair.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../website-db';
import { ensureSystemtestSchema } from './db';
import { initTicketsSchema } from '../tickets-db';
import { runReconciler } from './reconciler';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

interface FailedFixture {
  templateId: string;
  questionId: string;
  customerId: string;
  assignmentId: string;
  ticketId: string;
  cleanup: () => Promise<void>;
}

async function setupFailedStatus(): Promise<FailedFixture> {
  const templateId = randomUUID();
  const questionId = randomUUID();
  const customerId = randomUUID();
  const assignmentId = randomUUID();
  const ticketId = randomUUID();
  const customerEmail = `reconciler-${customerId}@systemtest.local`;

  await pool.query(
    `INSERT INTO questionnaire_templates (id, title, description, instructions, status, is_system_test)
     VALUES ($1, $2, $3, $4, 'published', true)`,
    [templateId, '[TEST] reconciler', 'fixture description', 'instructions'],
  );
  await pool.query(
    `INSERT INTO questionnaire_questions
       (id, template_id, position, question_text, question_type, test_expected_result)
     VALUES ($1, $2, 1, $3, 'test_step', $4)`,
    [questionId, templateId, 'Reconciler smoke test', 'Step passes'],
  );
  await pool.query(
    `INSERT INTO customers (id, name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [customerId, '[TEST] reconciler', customerEmail],
  );
  await pool.query(
    `INSERT INTO questionnaire_assignments (id, customer_id, template_id, status, is_test_data)
     VALUES ($1, $2, $3, 'submitted', true)`,
    [assignmentId, customerId, templateId],
  );
  await pool.query(
    `INSERT INTO tickets.tickets
       (id, type, brand, title, description, status,
        source_test_assignment_id, source_test_question_id, is_test_data)
     VALUES ($1, 'bug', 'mentolder', $2, $3, 'triage', $4, $5, false)`,
    [ticketId, 'Systemtest: reconciler fixture', 'fixture description', assignmentId, questionId],
  );
  // The status row points at the failure ticket so the reconciler's join can
  // hit it. retest_pending_at stays NULL — the bypassed UPDATE is what the
  // reconciler is meant to repair.
  await pool.query(
    `INSERT INTO questionnaire_test_status
       (question_id, last_result, last_result_at, last_assignment_id,
        last_failure_ticket_id, retest_pending_at, retest_attempt)
     VALUES ($1, 'nicht_erfüllt', now(), $2, $3, NULL, 0)`,
    [questionId, assignmentId, ticketId],
  );

  const cleanup = async () => {
    await pool.query(`DELETE FROM questionnaire_test_status WHERE question_id = $1`, [questionId]);
    await pool.query(`DELETE FROM tickets.tickets WHERE id = $1`, [ticketId]);
    await pool.query(`DELETE FROM tickets.tickets WHERE source_test_assignment_id = $1`, [assignmentId]);
    await pool.query(`DELETE FROM questionnaire_assignments WHERE id = $1`, [assignmentId]);
    await pool.query(`DELETE FROM questionnaire_questions WHERE template_id = $1`, [templateId]);
    await pool.query(`DELETE FROM questionnaire_templates WHERE id = $1`, [templateId]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  };

  return { templateId, questionId, customerId, assignmentId, ticketId, cleanup };
}

/**
 * Run an UPDATE without firing the retest trigger. Tries the standard
 * `session_replication_role = replica` route first (cheap, no DDL); if the
 * test DB role lacks superuser to set it, falls back to DROP TRIGGER → UPDATE
 * → CREATE TRIGGER. The CREATE re-uses the exact same DDL the bootstrap in
 * db.ts installs, so the trigger ends up identical after the dance.
 */
async function updateWithoutTrigger(ticketId: string, resolution: string): Promise<void> {
  const client = await pool.connect();
  try {
    let usedReplica = false;
    try {
      await client.query(`SET session_replication_role = replica`);
      usedReplica = true;
    } catch {
      // Not a superuser — fall through to the DDL dance.
    }

    // status='done' is required by the `resolution_only_when_closed` CHECK
    // constraint on tickets.tickets — a non-NULL resolution implies a closed
    // status. The reconciler doesn't care about status; it only joins on
    // resolution = 'fixed'.
    if (usedReplica) {
      try {
        await client.query(
          `UPDATE tickets.tickets SET status = 'done', resolution = $1, done_at = now()
            WHERE id = $2`,
          [resolution, ticketId],
        );
      } finally {
        await client.query(`SET session_replication_role = origin`).catch(() => {});
      }
      return;
    }

    // Fallback: temporarily drop the trigger. We use the same client so the
    // DROP/UPDATE/CREATE all live in one connection, but each is its own
    // implicit transaction (DROP/CREATE TRIGGER on a regular table runs in
    // autocommit fine).
    await client.query(`DROP TRIGGER IF EXISTS tickets_resolution_retest ON tickets.tickets`);
    try {
      await client.query(
        `UPDATE tickets.tickets SET status = 'done', resolution = $1, done_at = now()
          WHERE id = $2`,
        [resolution, ticketId],
      );
    } finally {
      await client.query(`
        CREATE TRIGGER tickets_resolution_retest
          AFTER UPDATE OF resolution ON tickets.tickets
          FOR EACH ROW EXECUTE FUNCTION trg_systemtest_retest()
      `);
    }
  } finally {
    client.release();
  }
}

// Retry the schema init once on "tuple concurrently updated" — vitest runs
// test files in parallel workers and `CREATE OR REPLACE FUNCTION` can race
// when multiple workers boot the same schema at the same time.
async function initSchemaWithRetry(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    try {
      await initTicketsSchema();
      await ensureSystemtestSchema(pool);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i < 2 && /tuple concurrently updated/.test(msg)) {
        await new Promise(r => setTimeout(r, 50 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

describe.skipIf(!dbAvailable)('runReconciler', () => {
  beforeAll(async () => {
    await initSchemaWithRetry();
  });

  const pending: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (pending.length) {
      const fn = pending.pop();
      if (fn) await fn().catch(() => {});
    }
  });

  it('stamps retest_pending_at for trigger-bypassed resolution=fixed updates', async () => {
    const f = await setupFailedStatus();
    pending.push(f.cleanup);

    await updateWithoutTrigger(f.ticketId, 'fixed');

    // Sanity check: the bypass actually worked — status row is still NULL.
    const before = await pool.query(
      `SELECT retest_pending_at FROM questionnaire_test_status
        WHERE question_id = $1 AND last_assignment_id = $2`,
      [f.questionId, f.assignmentId],
    );
    expect(before.rows[0].retest_pending_at).toBeNull();

    const result = await runReconciler(pool);
    expect(result.patched).toBeGreaterThan(0);

    const after = await pool.query(
      `SELECT retest_pending_at, retest_attempt
         FROM questionnaire_test_status
        WHERE question_id = $1 AND last_assignment_id = $2`,
      [f.questionId, f.assignmentId],
    );
    expect(after.rows[0].retest_pending_at).not.toBeNull();
    expect(after.rows[0].retest_attempt).toBe(1);
  });
});
