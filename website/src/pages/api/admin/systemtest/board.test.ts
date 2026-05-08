// website/src/pages/api/admin/systemtest/board.test.ts
//
// DB-gated tests for GET /api/admin/systemtest/board (Task 7).
// Mirrors the fixture pattern used by seed.test.ts and failure-bridge.test.ts.
//
// Skipped automatically when no DATABASE_URL/WEBSITE_DATABASE_URL/
// SESSIONS_DATABASE_URL is set, the same gate other DB-touching tests use.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Mocks must be declared BEFORE importing the route under test.
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { GET } from './board';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { ensureSystemtestSchema } from '../../../../lib/systemtest/db';
import { initTicketsSchema } from '../../../../lib/tickets-db';
import type { BoardResponse } from './board';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

const mockSession = { sub: 'admin', preferred_username: 'admin' } as any;

function makeReq(): Request {
  return new Request('http://test/api/admin/systemtest/board', {
    method: 'GET',
    headers: { cookie: 'workspace_session=test' },
  });
}

interface BoardFixture {
  templateId: string;
  questionId: string;
  customerId: string;
  assignmentId: string;
  ticketId: string;
  cleanup: () => Promise<void>;
}

/**
 * Seed a complete failure scenario: template (is_system_test) → question →
 * customer → assignment → status row (last_result='nicht_erfüllt') → ticket
 * with source_test back-refs and last_failure_ticket_id set.
 *
 * The view `v_systemtest_failure_board` requires both `last_failure_ticket_id`
 * on the status row AND a matching tickets.tickets row, so we set both.
 */
async function seedFailure(): Promise<BoardFixture> {
  const templateId = randomUUID();
  const questionId = randomUUID();
  const customerId = randomUUID();
  const assignmentId = randomUUID();
  const ticketId = randomUUID();
  const customerEmail = `board-test-${customerId}@systemtest.local`;

  await pool.query(
    `INSERT INTO questionnaire_templates (id, title, description, instructions, status, is_system_test)
     VALUES ($1, $2, $3, $4, 'published', true)`,
    [templateId, 'Board test template', 'desc', 'inst'],
  );
  await pool.query(
    `INSERT INTO questionnaire_questions
       (id, template_id, position, question_text, question_type, test_expected_result)
     VALUES ($1, $2, 1, 'Login funktioniert', 'test_step', 'lands on /portal')`,
    [questionId, templateId],
  );
  await pool.query(
    `INSERT INTO customers (id, name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [customerId, '[TEST] board-test', customerEmail],
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
    [ticketId, 'Systemtest: Board test — Q1: Login', 'desc', assignmentId, questionId],
  );
  await pool.query(
    `INSERT INTO questionnaire_test_status
       (question_id, last_result, last_result_at, last_assignment_id, last_failure_ticket_id)
     VALUES ($1, 'nicht_erfüllt', now(), $2, $3)`,
    [questionId, assignmentId, ticketId],
  );

  const cleanup = async () => {
    await pool.query(`DELETE FROM tickets.ticket_links WHERE from_id = $1 OR to_id = $1`, [ticketId]);
    await pool.query(`DELETE FROM tickets.tickets WHERE id = $1`, [ticketId]);
    await pool.query(`DELETE FROM questionnaire_test_status WHERE question_id = $1`, [questionId]);
    await pool.query(`DELETE FROM questionnaire_assignments WHERE id = $1`, [assignmentId]);
    await pool.query(`DELETE FROM questionnaire_questions WHERE id = $1`, [questionId]);
    await pool.query(`DELETE FROM questionnaire_templates WHERE id = $1`, [templateId]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  };

  return { templateId, questionId, customerId, assignmentId, ticketId, cleanup };
}

describe.skipIf(!dbAvailable)('GET /api/admin/systemtest/board', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(pool);
    await initTicketsSchema();
  });

  const pending: Array<() => Promise<void>> = [];
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession);
    vi.mocked(isAdmin).mockReturnValue(true);
  });
  afterEach(async () => {
    while (pending.length) {
      const fn = pending.pop();
      if (fn) await fn().catch(() => {});
    }
  });

  it('rejects when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: makeReq() } as any);
    expect(res.status).toBe(401);
  });

  it('returns the canonical {columns, undelivered} shape with all four columns present', async () => {
    const res = await GET({ request: makeReq() } as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as BoardResponse;
    expect(body).toHaveProperty('columns');
    expect(body).toHaveProperty('undelivered');
    expect(body.columns).toHaveProperty('open');
    expect(body.columns).toHaveProperty('fix_in_pr');
    expect(body.columns).toHaveProperty('retest_pending');
    expect(body.columns).toHaveProperty('green');
    expect(Array.isArray(body.columns.open)).toBe(true);
    expect(typeof body.undelivered).toBe('number');
  });

  it('places a seeded failure ticket under the "open" column', async () => {
    const f = await seedFailure();
    pending.push(f.cleanup);

    const res = await GET({ request: makeReq() } as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as BoardResponse;

    const found = body.columns.open.find(r => r.ticket_id === f.ticketId);
    expect(found).toBeTruthy();
    expect(found?.assignment_id).toBe(f.assignmentId);
    expect(found?.question_id).toBe(f.questionId);
    expect(found?.column_key).toBe('open');
    // The view aliases last_assignment_id AS assignment_id (Task 1 plan
    // adaptation noted in the task description).
    expect(found).toHaveProperty('assignment_id');
  });

  it('moves a row to "retest_pending" once retest_pending_at is stamped', async () => {
    const f = await seedFailure();
    pending.push(f.cleanup);

    await pool.query(
      `UPDATE questionnaire_test_status
          SET retest_pending_at = now(), retest_attempt = retest_attempt + 1
        WHERE question_id = $1`,
      [f.questionId],
    );

    const res = await GET({ request: makeReq() } as any);
    const body = (await res.json()) as BoardResponse;
    const found = body.columns.retest_pending.find(r => r.ticket_id === f.ticketId);
    expect(found).toBeTruthy();
    expect(found?.retest_attempt).toBeGreaterThanOrEqual(1);
  });

  it('counts undelivered outbox rows (retry_count >= 12)', async () => {
    const aId = randomUUID();
    const qId = randomUUID();
    await pool.query(
      `INSERT INTO systemtest_failure_outbox
         (assignment_id, question_id, attempt, last_error, retry_count)
       VALUES ($1, $2, 0, 'gave up', 12)`,
      [aId, qId],
    );
    pending.push(async () => {
      await pool.query(`DELETE FROM systemtest_failure_outbox WHERE assignment_id = $1`, [aId]);
    });

    const res = await GET({ request: makeReq() } as any);
    const body = (await res.json()) as BoardResponse;
    expect(body.undelivered).toBeGreaterThanOrEqual(1);
  });
});
