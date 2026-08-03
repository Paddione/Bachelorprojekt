// website/src/lib/systemtest/retest-trigger.test.ts
//
// DB-gated tests for the retest trigger created in Task 1 (db.ts →
// trg_systemtest_retest). The trigger should:
//   - stamp `questionnaire_test_status.retest_pending_at = now()` and
//     increment `retest_attempt` when a ticket's `resolution` flips from any
//     non-'fixed' value to 'fixed' AND `source_test_assignment_id` is set,
//   - leave `retest_pending_at` NULL on resolution=wontfix (or any non-fixed
//     transition).
//
// Important schema note: `questionnaire_test_status` is keyed by `question_id`
// only — there is no `assignment_id` column. The trigger therefore matches on
// `last_assignment_id`, and our fixtures must seed status rows with that
// column equal to the ticket's `source_test_assignment_id`.
//
// Skipped automatically when no DATABASE_URL/WEBSITE_DATABASE_URL/
// SESSIONS_DATABASE_URL is set, the same gate the rest of the systemtest DB
// tests use.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../website-db';
import { ensureSystemtestSchema } from './db';
import { initTicketsSchema } from '../tickets-db';

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

/**
 * Seeds a complete failure scenario:
 *   template → question → customer → assignment → status row (last_result =
 *   'nicht_erfüllt', last_assignment_id = assignment) → tickets row of
 *   type='bug' with resolution=NULL pointing at (assignment, question).
 *
 * The status row is intentionally seeded with `retest_pending_at = NULL` and
 * `retest_attempt = 0` so each test starts from a clean baseline.
 */
async function setupFailedStatus(): Promise<FailedFixture> {
  const templateId = randomUUID();
  const questionId = randomUUID();
  const customerId = randomUUID();
  const assignmentId = randomUUID();
  const ticketId = randomUUID();
  const customerEmail = `retest-trigger-${customerId}@systemtest.local`;

  await pool.query(
    `INSERT INTO questionnaire_templates (id, title, description, instructions, status, is_system_test)
     VALUES ($1, $2, $3, $4, 'published', true)`,
    [templateId, '[TEST] retest trigger', 'fixture description', 'instructions'],
  );
  await pool.query(
    `INSERT INTO questionnaire_questions
       (id, template_id, position, question_text, question_type, test_expected_result)
     VALUES ($1, $2, 1, $3, 'test_step', $4)`,
    [questionId, templateId, 'Trigger smoke test', 'Step passes'],
  );
  await pool.query(
    `INSERT INTO customers (id, name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [customerId, '[TEST] retest-trigger', customerEmail],
  );
  await pool.query(
    `INSERT INTO questionnaire_assignments (id, customer_id, template_id, status, is_test_data)
     VALUES ($1, $2, $3, 'submitted', true)`,
    [assignmentId, customerId, templateId],
  );
  await pool.query(
    `INSERT INTO questionnaire_test_status
       (question_id, last_result, last_result_at, last_assignment_id,
        retest_pending_at, retest_attempt)
     VALUES ($1, 'nicht_erfüllt', now(), $2, NULL, 0)`,
    [questionId, assignmentId],
  );
  await pool.query(
    `INSERT INTO tickets.tickets
       (id, type, brand, title, description, status,
        source_test_assignment_id, source_test_question_id, is_test_data)
     VALUES ($1, 'bug', 'mentolder', $2, $3, 'triage', $4, $5, false)`,
    [ticketId, 'Systemtest: trigger fixture', 'fixture description', assignmentId, questionId],
  );

  // FK-respecting cleanup: status → tickets → assignment → questions → templates → customer.
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

describe.skipIf(!dbAvailable)('retest trigger', () => {
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

  it('sets retest_pending_at when resolution flips to fixed', async () => {
    const f = await setupFailedStatus();
    pending.push(f.cleanup);

    // Both columns are updated in one statement: the `resolution_only_when_closed`
    // CHECK requires status IN ('done','archived') whenever resolution is set.
    // The trigger is `AFTER UPDATE OF resolution`, so it still fires.
    await pool.query(
      `UPDATE tickets.tickets SET status = 'done', resolution = 'fixed', done_at = now()
        WHERE id = $1`,
      [f.ticketId],
    );

    const r = await pool.query(
      `SELECT retest_pending_at, retest_attempt
         FROM questionnaire_test_status
        WHERE last_assignment_id = $1 AND question_id = $2`,
      [f.assignmentId, f.questionId],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].retest_pending_at).not.toBeNull();
    expect(r.rows[0].retest_attempt).toBe(1);
  });

  it('does NOT set retest_pending_at on resolution=wontfix', async () => {
    const f = await setupFailedStatus();
    pending.push(f.cleanup);

    await pool.query(
      `UPDATE tickets.tickets SET status = 'done', resolution = 'wontfix', done_at = now()
        WHERE id = $1`,
      [f.ticketId],
    );

    const r = await pool.query(
      `SELECT retest_pending_at, retest_attempt
         FROM questionnaire_test_status
        WHERE last_assignment_id = $1 AND question_id = $2`,
      [f.assignmentId, f.questionId],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].retest_pending_at).toBeNull();
    expect(r.rows[0].retest_attempt).toBe(0);
  });
});
