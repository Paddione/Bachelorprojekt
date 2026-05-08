// website/src/lib/systemtest/failure-bridge.test.ts
//
// DB-gated tests for the system-test failure-bridge. Mirrors the fixture
// pattern used by `db.test.ts` and `auth-only.test.ts` — each test inserts
// its own scoped fixtures (template, question, customer, assignment,
// status row), runs the bridge, asserts, and cleans up.
//
// Skipped automatically when no DATABASE_URL/WEBSITE_DATABASE_URL/
// SESSIONS_DATABASE_URL is set, the same gate other DB-touching tests use.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../website-db';
import { ensureSystemtestSchema } from './db';
import { initTicketsSchema } from '../tickets-db';
import { openFailureTicket, enqueueOutboxRetry } from './failure-bridge';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

interface Fixture {
  templateId: string;
  questionId: string;
  customerId: string;
  assignmentId: string;
  cleanup: () => Promise<void>;
}

async function createFixture(opts: { isSystemTest?: boolean; assignmentIsTestData?: boolean; titleSuffix?: string } = {}): Promise<Fixture> {
  const isSystemTest = opts.isSystemTest ?? true;
  const assignmentIsTestData = opts.assignmentIsTestData ?? true;
  const templateId = randomUUID();
  const questionId = randomUUID();
  const customerId = randomUUID();
  const assignmentId = randomUUID();
  const customerEmail = `failure-bridge-${customerId}@systemtest.local`;
  // Unique per-test title so each fixture's auto-created parent epic
  // (`EPIC-SYS-<brand>-<title-slug>`) is distinct and gets cleaned up
  // without colliding with concurrent tests.
  const templateTitle = `Auth-only system test ${opts.titleSuffix ?? templateId.slice(0, 8)}`;

  await pool.query(
    `INSERT INTO questionnaire_templates (id, title, description, instructions, status, is_system_test)
     VALUES ($1, $2, $3, $4, 'published', $5)`,
    [templateId, templateTitle, 'fixture description', 'instructions', isSystemTest],
  );
  await pool.query(
    `INSERT INTO questionnaire_questions
       (id, template_id, position, question_text, question_type, test_expected_result)
     VALUES ($1, $2, 3, $3, 'test_step', $4)`,
    [questionId, templateId, 'Login mit Magic-Link funktioniert', 'Login lands on /portal'],
  );
  await pool.query(
    `INSERT INTO customers (id, name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [customerId, '[TEST] failure-bridge', customerEmail],
  );
  await pool.query(
    `INSERT INTO questionnaire_assignments (id, customer_id, template_id, status, is_test_data)
     VALUES ($1, $2, $3, 'submitted', $4)`,
    [assignmentId, customerId, templateId, assignmentIsTestData],
  );

  const cleanup = async () => {
    // Order matters: drop ticket FK refs first so we can delete the
    // assignment. Also delete the auto-created parent epic for this
    // template (parent_id of the deleted children).
    await pool.query(
      `DELETE FROM tickets.tickets t
        WHERE t.id IN (
          SELECT DISTINCT parent_id FROM tickets.tickets
           WHERE source_test_assignment_id = $1 AND parent_id IS NOT NULL
        )`,
      [assignmentId],
    );
    await pool.query(
      `DELETE FROM tickets.tickets WHERE source_test_assignment_id = $1`,
      [assignmentId],
    );
    await pool.query(
      `DELETE FROM systemtest_failure_outbox WHERE assignment_id = $1`,
      [assignmentId],
    );
    await pool.query(
      `DELETE FROM questionnaire_test_status WHERE question_id = $1`,
      [questionId],
    );
    await pool.query(
      `DELETE FROM questionnaire_test_evidence WHERE assignment_id = $1`,
      [assignmentId],
    );
    await pool.query(
      `DELETE FROM questionnaire_assignments WHERE id = $1`,
      [assignmentId],
    );
    await pool.query(
      `DELETE FROM questionnaire_questions WHERE template_id = $1`,
      [templateId],
    );
    await pool.query(
      `DELETE FROM questionnaire_templates WHERE id = $1`,
      [templateId],
    );
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  };

  return { templateId, questionId, customerId, assignmentId, cleanup };
}

async function seedStatusRow(f: Fixture, result = 'nicht_erfüllt'): Promise<void> {
  await pool.query(
    `INSERT INTO questionnaire_test_status
       (question_id, last_result, last_result_at, last_assignment_id)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (question_id) DO UPDATE SET
       last_result = EXCLUDED.last_result,
       last_result_at = EXCLUDED.last_result_at,
       last_assignment_id = EXCLUDED.last_assignment_id`,
    [f.questionId, result, f.assignmentId],
  );
}

async function seedEvidenceRow(f: Fixture): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO questionnaire_test_evidence
       (id, assignment_id, question_id, attempt, replay_path)
     VALUES ($1, $2, $3, 0, '/tmp/test.rrweb')`,
    [id, f.assignmentId, f.questionId],
  );
  return id;
}

describe.skipIf(!dbAvailable)('openFailureTicket', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
    await initTicketsSchema();
  });

  const pending: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (pending.length) {
      const fn = pending.pop();
      if (fn) await fn().catch(() => {});
    }
  });

  it('creates a bug ticket with source_test back-refs and updates status', async () => {
    const f = await createFixture();
    pending.push(f.cleanup);
    await seedStatusRow(f);
    const evidenceId = await seedEvidenceRow(f);

    const ticketId = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
      evidenceId,
      details: 'Login button stays disabled.',
    });
    expect(ticketId).toBeTruthy();

    const t = await pool.query(
      `SELECT type, title, description, status, parent_id, component, severity,
              source_test_assignment_id, source_test_question_id, is_test_data
         FROM tickets.tickets WHERE id = $1`,
      [ticketId!],
    );
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].type).toBe('bug');
    expect(t.rows[0].title).toMatch(/^Systemtest:/);
    expect(t.rows[0].title).toContain('Q3');
    expect(t.rows[0].title).toContain('Auth-only system test');
    expect(t.rows[0].source_test_assignment_id).toBe(f.assignmentId);
    expect(t.rows[0].source_test_question_id).toBe(f.questionId);
    // Fixture's assignment is `is_test_data=true`, so the auto-created
    // ticket inherits that flag and is hidden from the real triage queue.
    expect(t.rows[0].is_test_data).toBe(true);
    expect(t.rows[0].component).toBe('systemtest');
    expect(t.rows[0].severity).toBe('minor');
    expect(t.rows[0].parent_id).toBeTruthy();
    expect(t.rows[0].description).toContain('Login lands on /portal');
    expect(t.rows[0].description).toContain('Login button stays disabled.');
    expect(t.rows[0].description).toContain(`/api/admin/evidence/${evidenceId}/replay`);
    expect(t.rows[0].description).toContain(`/admin/fragebogen/${f.assignmentId}`);

    // The auto-created parent epic is type='project', component='systemtest'
    // and shares the same title slug as the failing template.
    const epic = await pool.query(
      `SELECT type, title, component, external_id, is_test_data
         FROM tickets.tickets WHERE id = $1`,
      [t.rows[0].parent_id],
    );
    expect(epic.rows[0].type).toBe('project');
    expect(epic.rows[0].component).toBe('systemtest');
    expect(epic.rows[0].title).toMatch(/^Systemtest: Auth-only system test/);
    expect(epic.rows[0].external_id).toMatch(/^EPIC-SYS-/);

    const status = await pool.query(
      `SELECT last_failure_ticket_id, evidence_id
         FROM questionnaire_test_status WHERE question_id = $1`,
      [f.questionId],
    );
    expect(status.rows[0].last_failure_ticket_id).toBe(ticketId);
    expect(status.rows[0].evidence_id).toBe(evidenceId);
  });

  it('does not create a duplicate ticket when one already exists for the same step (still open)', async () => {
    const f = await createFixture();
    pending.push(f.cleanup);
    await seedStatusRow(f);

    const first = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
    });
    const second = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
    });
    expect(first).toBeTruthy();
    expect(second).toBe(first);

    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM tickets.tickets WHERE source_test_assignment_id = $1`,
      [f.assignmentId],
    );
    expect(count.rows[0].n).toBe('1');
  });

  it('returns null for non-system-test templates', async () => {
    const f = await createFixture({ isSystemTest: false });
    pending.push(f.cleanup);
    await seedStatusRow(f);

    const ticketId = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
    });
    expect(ticketId).toBeNull();
  });

  it('skips when status row points at a newer assignment', async () => {
    const f = await createFixture();
    pending.push(f.cleanup);
    // Status row tagged to a different (newer) assignment id.
    const newerAssignmentId = randomUUID();
    await pool.query(
      `INSERT INTO questionnaire_assignments (id, customer_id, template_id, status, is_test_data)
       VALUES ($1, $2, $3, 'submitted', true)`,
      [newerAssignmentId, f.customerId, f.templateId],
    );
    pending.push(async () => {
      await pool.query(`DELETE FROM questionnaire_assignments WHERE id = $1`, [newerAssignmentId]);
    });
    await pool.query(
      `INSERT INTO questionnaire_test_status (question_id, last_result, last_result_at, last_assignment_id)
       VALUES ($1, 'nicht_erfüllt', now(), $2)`,
      [f.questionId, newerAssignmentId],
    );

    const ticketId = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
    });
    expect(ticketId).toBeNull();

    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM tickets.tickets WHERE source_test_assignment_id = $1`,
      [f.assignmentId],
    );
    expect(count.rows[0].n).toBe('0');
  });

  it('opens a fresh ticket when previous failure ticket has been resolved=fixed', async () => {
    const f = await createFixture();
    pending.push(f.cleanup);
    await seedStatusRow(f);

    const firstId = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
    });
    expect(firstId).toBeTruthy();
    // Mark the first ticket as fixed.
    await pool.query(
      `UPDATE tickets.tickets SET status = 'done', resolution = 'fixed', done_at = now()
        WHERE id = $1`,
      [firstId!],
    );

    const secondId = await openFailureTicket(pool, {
      assignmentId: f.assignmentId,
      questionId: f.questionId,
    });
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);

    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM tickets.tickets WHERE source_test_assignment_id = $1`,
      [f.assignmentId],
    );
    expect(count.rows[0].n).toBe('2');
  });
});

describe.skipIf(!dbAvailable)('enqueueOutboxRetry', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
  });

  it('inserts a row into systemtest_failure_outbox', async () => {
    const assignmentId = randomUUID();
    const questionId = randomUUID();
    await enqueueOutboxRetry(pool, {
      assignmentId,
      questionId,
      attempt: 2,
      error: 'connection refused',
    });
    const r = await pool.query(
      `SELECT attempt, last_error, retry_count
         FROM systemtest_failure_outbox WHERE assignment_id = $1`,
      [assignmentId],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].attempt).toBe(2);
    expect(r.rows[0].last_error).toBe('connection refused');
    expect(r.rows[0].retry_count).toBe(0);
    await pool.query(
      `DELETE FROM systemtest_failure_outbox WHERE assignment_id = $1`,
      [assignmentId],
    );
  });
});
