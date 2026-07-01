// website/src/lib/systemtest/cleanup-mocked.test.ts
//
// Mocked-pool tests (no DATABASE_URL required) — always run, including in CI.
//
// `cleanup.ts` statically imports `openFailureTicket` (`./failure-bridge`)
// and `openTestRunFailureTicket` (`./test-run-bridge`), both of which reach
// for a real Postgres connection when creating a ticket. To exercise
// `drainOutbox`'s branching (test_run vs questionnaire vs malformed rows,
// success vs failure) without a live DB, we `vi.doMock` both sibling modules
// and re-import a fresh copy of `cleanup.ts` in this block's `beforeAll`.
//
// `../identity` is mocked at module scope for the whole file (see below), so
// `keycloak.deleteUser` is a `vi.fn()` here too — we just reach for it
// per-test to script its resolved value.
//
// Split out from `cleanup.test.ts` (which holds the DB-gated suites for
// `purgeFixturesFor` / `drainOutbox` / `purgeExpiredMagicTokens`) to keep
// both files under the repo's S1 file-size CI gate.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';

vi.mock('../identity', () => ({
  deleteUser: vi.fn().mockResolvedValue(true),
}));

describe('purgeFixturesFor / drainOutbox / purgeExpiredMagicTokens (mocked pool)', () => {
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
    const fakePool = { query, connect: vi.fn() };
    return { pool: fakePool as unknown as Pool, calls };
  }

  let purgeFixturesForMocked: typeof import('./cleanup').purgeFixturesFor;
  let drainOutboxMocked: typeof import('./cleanup').drainOutbox;
  let purgeExpiredMagicTokensMocked: typeof import('./cleanup').purgeExpiredMagicTokens;
  let openFailureTicketMock: ReturnType<typeof vi.fn>;
  let openTestRunFailureTicketMock: ReturnType<typeof vi.fn>;
  let deleteUserMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    vi.resetModules();
    openFailureTicketMock = vi.fn();
    openTestRunFailureTicketMock = vi.fn();
    vi.doMock('./failure-bridge', () => ({ openFailureTicket: openFailureTicketMock }));
    vi.doMock('./test-run-bridge', () => ({
      openTestRunFailureTicket: openTestRunFailureTicketMock,
    }));
    const identityModule = await import('../identity');
    deleteUserMock = vi.mocked(identityModule.deleteUser);
    const mod = await import('./cleanup');
    purgeFixturesForMocked = mod.purgeFixturesFor;
    drainOutboxMocked = mod.drainOutbox;
    purgeExpiredMagicTokensMocked = mod.purgeExpiredMagicTokens;
  });

  afterEach(() => {
    openFailureTicketMock.mockReset();
    openTestRunFailureTicketMock.mockReset();
    deleteUserMock.mockReset();
    deleteUserMock.mockResolvedValue(true);
  });

  afterAll(() => {
    vi.doUnmock('./failure-bridge');
    vi.doUnmock('./test-run-bridge');
    vi.resetModules();
  });

  describe('purgeFixturesFor', () => {
    it('records a purge_error and does not throw when the table is not in ALLOWED_TABLES', async () => {
      const { pool: fakePool, calls } = scriptedPool([
        () => ({ rows: [{ id: 'f1', table_name: 'evil.table', row_id: 'r1' }] }),
        () => ({ rowCount: 1 }), // UPDATE purge_error
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 0, errors: 1 });
      expect(calls[1].sql).toMatch(/purge_error/);
      expect(calls[1].params?.[1]).toMatch(/table not in ALLOWED_TABLES: evil\.table/);
    });

    it('purges a keycloak.users fixture via identity.deleteUser', async () => {
      deleteUserMock.mockResolvedValue(true);
      const { pool: fakePool, calls } = scriptedPool([
        () => ({ rows: [{ id: 'f2', table_name: 'keycloak.users', row_id: 'kc-1' }] }),
        () => ({ rowCount: 1 }), // UPDATE purged_at
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 1, errors: 0 });
      expect(deleteUserMock).toHaveBeenCalledWith('kc-1');
      expect(calls[1].sql).toMatch(/purged_at = now\(\)/);
    });

    it('records a purge_error when identity.deleteUser returns false', async () => {
      deleteUserMock.mockResolvedValue(false);
      const { pool: fakePool, calls } = scriptedPool([
        () => ({ rows: [{ id: 'f3', table_name: 'keycloak.users', row_id: 'kc-2' }] }),
        () => ({ rowCount: 1 }), // UPDATE purge_error
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 0, errors: 1 });
      expect(calls[1].params?.[1]).toMatch(/keycloak\.deleteUser\(kc-2\) returned false/);
    });

    it('purges a tickets.tickets fixture (is_test_data flag) and errors when no row matched', async () => {
      const { pool: fakePool, calls } = scriptedPool([
        () => ({ rows: [{ id: 'f4', table_name: 'tickets.tickets', row_id: 't-1' }] }),
        () => ({ rowCount: 1 }), // DELETE ... is_test_data = true
        () => ({ rowCount: 1 }), // UPDATE purged_at
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 1, errors: 0 });
      expect(calls[1].sql).toMatch(/DELETE FROM tickets\.tickets WHERE id = \$1 AND is_test_data = true/);
    });

    it('errors when the is_test_data-flagged delete matches zero rows', async () => {
      const { pool: fakePool, calls } = scriptedPool([
        () => ({ rows: [{ id: 'f5', table_name: 'tickets.tickets', row_id: 't-2' }] }),
        () => ({ rowCount: 0 }), // DELETE matched nothing
        () => ({ rowCount: 1 }), // UPDATE purge_error
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 0, errors: 1 });
      expect(calls[2].params?.[1]).toMatch(/no row deleted from tickets\.tickets/);
    });

    it('purges a customers fixture unconditionally (no is_test_data column) even if rowCount is 0', async () => {
      const { pool: fakePool, calls } = scriptedPool([
        () => ({ rows: [{ id: 'f6', table_name: 'customers', row_id: 'c-1' }] }),
        () => ({ rowCount: 0 }), // DELETE — idempotent, no throw
        () => ({ rowCount: 1 }), // UPDATE purged_at
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 1, errors: 0 });
      expect(calls[1].sql).toBe('DELETE FROM customers WHERE id = $1');
    });

    it('processes multiple due rows independently (one succeeds, one fails)', async () => {
      const { pool: fakePool } = scriptedPool([
        () => ({
          rows: [
            { id: 'f7', table_name: 'customers', row_id: 'c-2' },
            { id: 'f8', table_name: 'unknown.table', row_id: 'x-1' },
          ],
        }),
        () => ({ rowCount: 1 }), // DELETE customers
        () => ({ rowCount: 1 }), // UPDATE purged_at (row f7)
        () => ({ rowCount: 1 }), // UPDATE purge_error (row f8)
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 1, errors: 1 });
    });

    it('does not throw when persisting the purge_error itself fails (best-effort)', async () => {
      const { pool: fakePool } = scriptedPool([
        () => ({ rows: [{ id: 'f9', table_name: 'unknown.table', row_id: 'x-2' }] }),
        () => {
          throw new Error('connection lost while writing purge_error');
        },
      ]);
      const result = await purgeFixturesForMocked(fakePool, { graceHours: 24 });
      expect(result).toEqual({ purged: 0, errors: 1 });
    });
  });

  describe('drainOutbox', () => {
    it('retries a test_run row via openTestRunFailureTicket and deletes it on success', async () => {
      openTestRunFailureTicketMock.mockResolvedValue('ticket-1');
      const { pool: fakePool, calls } = scriptedPool([
        () => ({
          rows: [
            {
              id: 'o1', source_kind: 'test_run', assignment_id: null, question_id: null,
              run_id: 'run-1', test_id: 'FA-1/case', test_result_id: 5,
              test_name: 'FA-1 case', error_message: 'boom', file_path: 'a.spec.ts',
            },
          ],
          rowCount: 1,
        }),
        () => ({ rowCount: 1 }), // DELETE outbox row
      ]);
      const result = await drainOutboxMocked(fakePool);
      expect(result).toEqual({ retried: 1, succeeded: 1 });
      expect(openTestRunFailureTicketMock).toHaveBeenCalledWith(fakePool, {
        runId: 'run-1',
        testId: 'FA-1/case',
        resultId: 5,
        name: 'FA-1 case',
        error: 'boom',
        filePath: 'a.spec.ts',
      });
      expect(calls[1].sql).toMatch(/DELETE FROM systemtest_failure_outbox/);
    });

    it('retries a questionnaire row via openFailureTicket and deletes it on success', async () => {
      openFailureTicketMock.mockResolvedValue('ticket-2');
      const { pool: fakePool, calls } = scriptedPool([
        () => ({
          rows: [
            {
              id: 'o2', source_kind: 'questionnaire', assignment_id: 'a-1', question_id: 'q-1',
              run_id: null, test_id: null, test_result_id: null, test_name: null,
              error_message: null, file_path: null,
            },
          ],
          rowCount: 1,
        }),
        () => ({ rowCount: 1 }), // DELETE outbox row
      ]);
      const result = await drainOutboxMocked(fakePool);
      expect(result).toEqual({ retried: 1, succeeded: 1 });
      expect(openFailureTicketMock).toHaveBeenCalledWith(fakePool, {
        assignmentId: 'a-1',
        questionId: 'q-1',
      });
      expect(calls[1].sql).toMatch(/DELETE FROM systemtest_failure_outbox/);
    });

    it('marks a malformed row (missing both key sets) as given up and skips it', async () => {
      const { pool: fakePool, calls } = scriptedPool([
        () => ({
          rows: [
            {
              id: 'o3', source_kind: null, assignment_id: null, question_id: null,
              run_id: null, test_id: null, test_result_id: null, test_name: null,
              error_message: null, file_path: null,
            },
          ],
          rowCount: 1,
        }),
        () => ({ rowCount: 1 }), // UPDATE retry_count = 12
      ]);
      const result = await drainOutboxMocked(fakePool);
      expect(result).toEqual({ retried: 1, succeeded: 0 });
      expect(calls[1].sql).toMatch(/retry_count = 12/);
      expect(calls[1].sql).toMatch(/malformed: missing key columns/);
      expect(openFailureTicketMock).not.toHaveBeenCalled();
      expect(openTestRunFailureTicketMock).not.toHaveBeenCalled();
    });

    it('bumps retry_count and records last_error when the bridge call throws', async () => {
      openFailureTicketMock.mockRejectedValue(new Error('transient db error'));
      const { pool: fakePool, calls } = scriptedPool([
        () => ({
          rows: [
            {
              id: 'o4', source_kind: 'questionnaire', assignment_id: 'a-2', question_id: 'q-2',
              run_id: null, test_id: null, test_result_id: null, test_name: null,
              error_message: null, file_path: null,
            },
          ],
          rowCount: 1,
        }),
        () => ({ rowCount: 1 }), // UPDATE retry_count + 1
      ]);
      const result = await drainOutboxMocked(fakePool);
      expect(result).toEqual({ retried: 1, succeeded: 0 });
      expect(calls[1].sql).toMatch(/retry_count = retry_count \+ 1/);
      expect(calls[1].params).toEqual(['o4', 'transient db error']);
    });

    it('processes multiple due rows independently (one succeeds, one fails)', async () => {
      openFailureTicketMock.mockResolvedValueOnce('ticket-ok');
      openTestRunFailureTicketMock.mockRejectedValueOnce(new Error('nope'));
      const { pool: fakePool } = scriptedPool([
        () => ({
          rows: [
            {
              id: 'o5', source_kind: 'questionnaire', assignment_id: 'a-3', question_id: 'q-3',
              run_id: null, test_id: null, test_result_id: null, test_name: null,
              error_message: null, file_path: null,
            },
            {
              id: 'o6', source_kind: 'test_run', assignment_id: null, question_id: null,
              run_id: 'run-6', test_id: 'FA-6/case', test_result_id: null, test_name: 'FA-6',
              error_message: null, file_path: null,
            },
          ],
          rowCount: 2,
        }),
        () => ({ rowCount: 1 }), // DELETE o5 (succeeded)
        () => ({ rowCount: 1 }), // UPDATE o6 retry_count + 1
      ]);
      const result = await drainOutboxMocked(fakePool);
      expect(result).toEqual({ retried: 2, succeeded: 1 });
    });
  });

  describe('purgeExpiredMagicTokens', () => {
    it('returns the deleted row count', async () => {
      const { pool: fakePool, calls } = scriptedPool([() => ({ rowCount: 3 })]);
      const result = await purgeExpiredMagicTokensMocked(fakePool);
      expect(result).toEqual({ purged: 3 });
      expect(calls[0].sql).toMatch(/DELETE FROM systemtest_magic_tokens/);
    });

    it('returns 0 when nothing matched', async () => {
      const { pool: fakePool } = scriptedPool([() => ({ rowCount: 0 })]);
      const result = await purgeExpiredMagicTokensMocked(fakePool);
      expect(result).toEqual({ purged: 0 });
    });
  });
});
