// website/src/lib/systemtest/failure-bridge-mocked.test.ts
//
// Mocked-pool tests (no DATABASE_URL required) — always run, including in CI.
//
// `openFailureTicket` lazily dynamic-imports `../tickets-db` and calls its
// `initTicketsSchema()`, which — unlike this module — reaches for the real
// `website-db` pool internally (it takes no pool argument). To keep these
// tests DB-free we `vi.doMock` that module and re-import a *fresh* copy of
// `failure-bridge.ts` inside this describe block, so the dynamic import
// resolves to our stub instead of touching a real connection. The
// DB-gated suites in the sibling file `failure-bridge.test.ts` use a
// separate, already-bound module instance and are unaffected by
// `vi.resetModules()`.
//
// A `scriptedPool` fake replaces `pg.Pool`: each call to `.query` (via either
// `pool.query` or `client.query`) consumes the next handler in a fixed
// sequence mirroring the exact order `openFailureTicket` issues queries in.
// This lets us drive every branch (short-circuits, dedup, creation, error/
// rollback) deterministically without a real database.

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import type { Pool } from 'pg';

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
    process.env.PROD_DOMAIN = 'example.test';
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
    expect(description).toContain('https://web.example.test/admin/fragebogen/a1');
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
