// website/src/lib/systemtest/failure-bridge.test.ts
//
// DB-gated tests for the system-test failure-bridge. Mirrors the fixture
// pattern used by `db.test.ts` and `auth-only.test.ts` — each test inserts
// its own scoped fixtures (template, question, customer, assignment,
// status row), runs the bridge, asserts, and cleans up.
//
// Skipped automatically when no DATABASE_URL/WEBSITE_DATABASE_URL/
// SESSIONS_DATABASE_URL is set, the same gate other DB-touching tests use.

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
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

// ---------------------------------------------------------------------------
// Mocked-pool tests (no DATABASE_URL required) — always run, including in CI.
//
// `openFailureTicket` lazily dynamic-imports `../tickets-db` and calls its
// `initTicketsSchema()`, which — unlike this module — reaches for the real
// `website-db` pool internally (it takes no pool argument). To keep these
// tests DB-free we `vi.doMock` that module and re-import a *fresh* copy of
// `failure-bridge.ts` inside this describe block, so the dynamic import
// resolves to our stub instead of touching a real connection. The top-level
// `openFailureTicket` import used by the DB-gated suites above is a separate,
// already-bound module instance and is unaffected by `vi.resetModules()`.
//
// A `scriptedPool` fake replaces `pg.Pool`: each call to `.query` (via either
// `pool.query` or `client.query`) consumes the next handler in a fixed
// sequence mirroring the exact order `openFailureTicket` issues queries in.
// This lets us drive every branch (short-circuits, dedup, creation, error/
// rollback) deterministically without a real database.
// ---------------------------------------------------------------------------
describe('openFailureTicket / enqueueOutboxRetry (mocked pool)', () => {
  type Handler = (sql: string, params: unknown[]) => unknown;

  function scriptedPool(handlers: Handler[]) {
    let i = 0;
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const p = params ?? [];
      calls.push({ sql, params: p });
      const h = handlers[i];
      if (!h) {
        throw new Error(
          `scriptedPool: no handler registered for call #${i + 1}: ${sql.slice(0, 120)}`,
        );
      }
      i++;
      return h(sql, p);
    });
    const client = { query, release: vi.fn() };
    const fakePool = { query, connect: vi.fn(async () => client) };
    return { pool: fakePool as unknown as Pool, calls, client };
  }

  let openFailureTicketMocked: typeof import('./failure-bridge').openFailureTicket;
  let enqueueOutboxRetryMocked: typeof import('./failure-bridge').enqueueOutboxRetry;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../tickets-db', () => ({
      initTicketsSchema: vi.fn().mockResolvedValue(undefined),
    }));
    const mod = await import('./failure-bridge');
    openFailureTicketMocked = mod.openFailureTicket;
    enqueueOutboxRetryMocked = mod.enqueueOutboxRetry;
  });

  afterAll(() => {
    vi.doUnmock('../tickets-db');
    vi.resetModules();
  });

  const baseCtx = {
    template_id: 'tpl-1',
    template_title: 'Auth-only system test',
    is_system_test: true,
    question_text: 'Login mit Magic-Link funktioniert',
    test_expected_result: 'Login lands on /portal',
    position: 3,
    last_assignment_id: null as string | null,
    last_failure_ticket_id: null as string | null,
    assignment_is_test_data: true as boolean | null,
  };

  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env.BRAND = OLD_ENV.BRAND;
    process.env.PROD_DOMAIN = OLD_ENV.PROD_DOMAIN;
  });

  it('returns null when the question context is not found', async () => {
    const { pool: fakePool, calls } = scriptedPool([() => ({ rows: [] })]);
    const result = await openFailureTicketMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
    });
    expect(result).toBeNull();
    expect(calls.length).toBe(1);
  });

  it('returns null for non-system-test templates', async () => {
    const { pool: fakePool } = scriptedPool([
      () => ({ rows: [{ ...baseCtx, is_system_test: false }] }),
    ]);
    const result = await openFailureTicketMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
    });
    expect(result).toBeNull();
  });

  it('returns null when the status row points at a newer assignment (stale-row guard)', async () => {
    const { pool: fakePool } = scriptedPool([
      () => ({ rows: [{ ...baseCtx, last_assignment_id: 'a-newer' }] }),
    ]);
    const result = await openFailureTicketMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
    });
    expect(result).toBeNull();
  });

  it('returns the existing open ticket id and bumps it (dedup, no evidence)', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [baseCtx] }),
      () => ({ rows: [{ id: 'existing-ticket' }] }),
      () => ({ rowCount: 1 }),
    ]);
    const result = await openFailureTicketMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
    });
    expect(result).toBe('existing-ticket');
    expect(calls.length).toBe(3);
    expect(calls[2].sql).toMatch(/UPDATE tickets\.tickets/);
  });

  it('bumps evidence_id on questionnaire_test_status when dedup fires with an evidenceId', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [baseCtx] }),
      () => ({ rows: [{ id: 'existing-ticket' }] }),
      () => ({ rowCount: 1 }),
      () => ({ rowCount: 1 }),
    ]);
    const result = await openFailureTicketMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
      evidenceId: 'ev-1',
    });
    expect(result).toBe('existing-ticket');
    expect(calls.length).toBe(4);
    expect(calls[3].sql).toMatch(/UPDATE questionnaire_test_status/);
    expect(calls[3].params).toEqual(['ev-1', 'q1', 'a1']);
  });

  it('creates a new ticket + epic, truncates long text, slugifies diacritics, and stamps test_status', async () => {
    process.env.BRAND = 'mentolder';
    delete process.env.PROD_DOMAIN;
    const longQuestion = 'Ä'.repeat(200) + ' sehr langer Fragetext';
    const ctx = {
      ...baseCtx,
      template_title: 'Prüfung äöü Systemtest',
      question_text: longQuestion,
      assignment_is_test_data: true,
    };
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [ctx] }),
      () => ({ rows: [] }), // existingOpen: none
      () => ({}), // BEGIN
      () => ({}), // set_config
      () => ({ rows: [{ id: 'epic-1' }] }), // epic insert
      () => ({ rows: [{ id: 'new-ticket-1' }] }), // main insert
      () => ({ rowCount: 1 }), // update test_status
      () => ({}), // COMMIT
    ]);

    const result = await openFailureTicketMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
      evidenceId: 'ev-1',
      details: 'Login button stays disabled.',
    });

    expect(result).toBe('new-ticket-1');
    expect(calls.length).toBe(8);

    const epicCall = calls[4];
    expect(epicCall.params?.[0]).toMatch(/^EPIC-SYS-mentolder-[a-z0-9-]+$/);

    const insertCall = calls[5];
    const [brand, epicId, title, description, assignmentId, questionId, isTestData] =
      insertCall.params as [string, string, string, string, string, string, boolean];
    expect(brand).toBe('mentolder');
    expect(epicId).toBe('epic-1');
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title).toContain('Q3');
    expect(title.endsWith('…') || title.length < 200).toBe(true);
    expect(description).toContain('Login lands on /portal');
    expect(description).toContain('Login button stays disabled.');
    expect(description).toContain('http://web.localhost/api/admin/evidence/ev-1/replay');
    expect(description).toContain('http://web.localhost/admin/fragebogen/a1');
    expect(assignmentId).toBe('a1');
    expect(questionId).toBe('q1');
    expect(isTestData).toBe(true);
  });

  it('marks the ticket as test data when the template title contains [TEST], even if the assignment is not', async () => {
    const ctx = {
      ...baseCtx,
      template_title: '[TEST] Smoke template',
      assignment_is_test_data: false,
    };
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [ctx] }),
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => ({ rows: [{ id: 'epic-2' }] }),
      () => ({ rows: [{ id: 'new-ticket-2' }] }),
      () => ({ rowCount: 1 }),
      () => ({}),
    ]);
    await openFailureTicketMocked(fakePool, { assignmentId: 'a1', questionId: 'q1' });
    const insertCall = calls[5];
    expect(insertCall.params?.[6]).toBe(true);
  });

  it('uses PROD_DOMAIN for the public base URL when set', async () => {
    process.env.PROD_DOMAIN = 'mentolder.de';
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [baseCtx] }),
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => ({ rows: [{ id: 'epic-3' }] }),
      () => ({ rows: [{ id: 'new-ticket-3' }] }),
      () => ({ rowCount: 1 }),
      () => ({}),
    ]);
    await openFailureTicketMocked(fakePool, { assignmentId: 'a1', questionId: 'q1' });
    const description = calls[5].params?.[3] as string;
    expect(description).toContain('https://web.mentolder.de/admin/fragebogen/a1');
  });

  it('rolls back and rethrows when the ticket insert fails', async () => {
    const { pool: fakePool, calls, client } = scriptedPool([
      () => ({ rows: [baseCtx] }),
      () => ({ rows: [] }),
      () => ({}), // BEGIN
      () => ({}), // set_config
      () => ({ rows: [{ id: 'epic-4' }] }), // epic insert
      () => {
        throw new Error('insert failed: unique_violation');
      },
      () => ({}), // ROLLBACK
    ]);

    await expect(
      openFailureTicketMocked(fakePool, { assignmentId: 'a1', questionId: 'q1' }),
    ).rejects.toThrow('insert failed: unique_violation');

    expect(calls.length).toBe(7);
    expect(calls[6].sql).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('enqueueOutboxRetry inserts a row and truncates the error message to 4000 chars', async () => {
    const longError = 'x'.repeat(5000);
    const { pool: fakePool, calls } = scriptedPool([() => ({ rowCount: 1 })]);
    await enqueueOutboxRetryMocked(fakePool, {
      assignmentId: 'a1',
      questionId: 'q1',
      attempt: 3,
      error: longError,
    });
    expect(calls.length).toBe(1);
    const params = calls[0].params as [string, string, number, string];
    expect(params[0]).toBe('a1');
    expect(params[1]).toBe('q1');
    expect(params[2]).toBe(3);
    expect(params[3].length).toBe(4000);
  });
});
