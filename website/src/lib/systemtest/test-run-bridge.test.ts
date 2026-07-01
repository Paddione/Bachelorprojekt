// website/src/lib/systemtest/test-run-bridge.test.ts
//
// Mocked-pool tests for the test-run failure bridge (no DATABASE_URL
// required — always run, including in CI). Mirrors the fixture-free
// `scriptedPool` approach used in `failure-bridge.test.ts`'s "(mocked pool)"
// suite: `openTestRunFailureTicket` lazily dynamic-imports `../tickets-db`
// and calls its `initTicketsSchema()`, which reaches for the real
// `website-db` pool internally (no pool argument). We `vi.doMock` that
// module and re-import a fresh copy of `test-run-bridge.ts` inside this
// file's `beforeAll`, so the dynamic import resolves to a stub instead of
// touching a real connection.
//
// A `scriptedPool` fake replaces `pg.Pool`: each call to `.query` (via
// either `pool.query` or `client.query`) consumes the next handler in a
// fixed sequence mirroring the exact order the bridge issues queries in.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';

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

let openTestRunFailureTicket: typeof import('./test-run-bridge').openTestRunFailureTicket;
let enqueueTestRunOutboxRetry: typeof import('./test-run-bridge').enqueueTestRunOutboxRetry;
let safeOpenTestRunFailureTicket: typeof import('./test-run-bridge').safeOpenTestRunFailureTicket;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('../tickets-db', () => ({
    initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  }));
  const mod = await import('./test-run-bridge');
  openTestRunFailureTicket = mod.openTestRunFailureTicket;
  enqueueTestRunOutboxRetry = mod.enqueueTestRunOutboxRetry;
  safeOpenTestRunFailureTicket = mod.safeOpenTestRunFailureTicket;
});

afterAll(() => {
  vi.doUnmock('../tickets-db');
  vi.resetModules();
});

const OLD_ENV = { ...process.env };
afterEach(() => {
  process.env.BRAND_ID = OLD_ENV.BRAND_ID;
  process.env.BRAND = OLD_ENV.BRAND;
  process.env.PROD_DOMAIN = OLD_ENV.PROD_DOMAIN;
});

describe('openTestRunFailureTicket', () => {
  it('returns the existing open ticket id without touching source_test_result_id when resultId is not given', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [{ id: 'existing-1' }] }),
    ]);
    const result = await openTestRunFailureTicket(fakePool, {
      runId: 'run-1',
      testId: 'FA-1/case-1',
      name: 'FA-1 case 1',
    });
    expect(result).toBe('existing-1');
    expect(calls.length).toBe(1);
  });

  it('refreshes source_test_result_id on the existing open ticket when resultId is given', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [{ id: 'existing-2' }] }),
      () => ({ rowCount: 1 }),
    ]);
    const result = await openTestRunFailureTicket(fakePool, {
      runId: 'run-1',
      testId: 'FA-1/case-1',
      name: 'FA-1 case 1',
      resultId: 42,
    });
    expect(result).toBe('existing-2');
    expect(calls.length).toBe(2);
    expect(calls[1].sql).toMatch(/UPDATE tickets\.tickets/);
    expect(calls[1].params).toEqual([42, 'existing-2']);
  });

  it('creates a new ticket for a github-sourced run, truncating a long error message', async () => {
    process.env.BRAND_ID = 'korczewski';
    delete process.env.PROD_DOMAIN;
    const longError = 'boom '.repeat(400); // > 1000 chars
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [] }), // existing check: none
      () => ({}), // BEGIN
      () => ({}), // set_config
      () => ({ rows: [{ id: 'new-1' }] }), // main insert
      () => ({}), // COMMIT
    ]);

    const result = await openTestRunFailureTicket(fakePool, {
      runId: 'run-42',
      testId: 'e2e/spec.ts :: does the thing',
      name: 'does the thing   with   extra   spaces',
      category: 'E2E',
      error: longError,
      filePath: 'tests/e2e/spec.ts',
      cluster: 'mentolder',
      source: 'github',
      githubRunId: '123456',
    });

    expect(result).toBe('new-1');
    expect(calls.length).toBe(5);

    const insertCall = calls[3];
    const [brand, title, description, runId, resultId, testId] = insertCall.params as [
      string, string, string, string, number | null, string,
    ];
    expect(brand).toBe('korczewski');
    expect(title).toMatch(/^Testfehler \[E2E\]: does the thing with extra spaces$/);
    expect(title.length).toBeLessThanOrEqual(200);
    expect(description).toContain('**Test:** e2e/spec.ts :: does the thing');
    expect(description).toContain('**Datei:** tests/e2e/spec.ts');
    expect(description).toContain('**Cluster:** mentolder');
    expect(description).toContain('**Kategorie:** E2E');
    expect(description).toContain('…'); // truncated error ends with ellipsis
    expect(description.length).toBeLessThan(longError.length);
    expect(description).toContain('http://web.localhost/admin/tests/runs/run-42');
    expect(description).toContain(
      'https://github.com/Paddione/Bachelorprojekt/actions/runs/123456',
    );
    expect(runId).toBe('run-42');
    expect(resultId).toBeNull();
    expect(testId).toBe('e2e/spec.ts :: does the thing');
  });

  it('omits the GitHub Actions link when source is not github', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => ({ rows: [{ id: 'new-2' }] }),
      () => ({}),
    ]);
    await openTestRunFailureTicket(fakePool, {
      runId: 'run-7',
      testId: 'BATS/case',
      name: 'bats case',
      source: 'cli',
    });
    const description = calls[3].params?.[2] as string;
    expect(description).not.toContain('github.com');
  });

  it('resolves the public base URL from PROD_DOMAIN when set', async () => {
    process.env.PROD_DOMAIN = 'example.test';
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => ({ rows: [{ id: 'new-3' }] }),
      () => ({}),
    ]);
    await openTestRunFailureTicket(fakePool, {
      runId: 'run-9',
      testId: 'NFA-1/case',
      name: 'nfa case',
    });
    const description = calls[3].params?.[2] as string;
    expect(description).toContain('https://web.example.test/admin/tests/runs/run-9');
  });

  it('falls back to BRAND when BRAND_ID is unset, and "mentolder" when neither is set', async () => {
    delete process.env.BRAND_ID;
    delete process.env.BRAND;
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => ({ rows: [{ id: 'new-4' }] }),
      () => ({}),
    ]);
    await openTestRunFailureTicket(fakePool, {
      runId: 'run-10',
      testId: 'AK-1/case',
      name: 'ak case',
    });
    expect(calls[3].params?.[0]).toBe('mentolder');
  });

  it('rolls back and rethrows when the ticket insert fails', async () => {
    const { pool: fakePool, calls, client } = scriptedPool([
      () => ({ rows: [] }),
      () => ({}), // BEGIN
      () => ({}), // set_config
      () => {
        throw new Error('insert failed: fk_violation');
      },
      () => ({}), // ROLLBACK
    ]);

    await expect(
      openTestRunFailureTicket(fakePool, {
        runId: 'run-err',
        testId: 'SA-1/case',
        name: 'sa case',
      }),
    ).rejects.toThrow('insert failed: fk_violation');

    expect(calls.length).toBe(5);
    expect(calls[4].sql).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('enqueueTestRunOutboxRetry', () => {
  it('inserts a row and truncates name/error/filePath/failureMessage to their limits', async () => {
    const { pool: fakePool, calls } = scriptedPool([() => ({ rowCount: 1 })]);
    await enqueueTestRunOutboxRetry(fakePool, {
      runId: 'run-1',
      testId: 'FA-1/case',
      resultId: 7,
      name: 'n'.repeat(600),
      error: 'e'.repeat(5000),
      filePath: 'f'.repeat(600),
      attempt: 2,
      failureMessage: 'm'.repeat(5000),
    });
    expect(calls.length).toBe(1);
    const [runId, testId, resultId, name, error, filePath, attempt, failureMessage] =
      calls[0].params as [string, string, number, string, string, string, number, string];
    expect(runId).toBe('run-1');
    expect(testId).toBe('FA-1/case');
    expect(resultId).toBe(7);
    expect(name.length).toBe(500);
    expect(error.length).toBe(4000);
    expect(filePath.length).toBe(500);
    expect(attempt).toBe(2);
    expect(failureMessage.length).toBe(4000);
  });

  it('defaults resultId/error/filePath/attempt to null/0 when omitted', async () => {
    const { pool: fakePool, calls } = scriptedPool([() => ({ rowCount: 1 })]);
    await enqueueTestRunOutboxRetry(fakePool, {
      runId: 'run-2',
      testId: 'FA-2/case',
      name: 'short',
      failureMessage: 'short failure',
    });
    const [, , resultId, , error, filePath, attempt] = calls[0].params as [
      string, string, number | null, string, string | null, string | null, number,
    ];
    expect(resultId).toBeNull();
    expect(error).toBeNull();
    expect(filePath).toBeNull();
    expect(attempt).toBe(0);
  });
});

describe('safeOpenTestRunFailureTicket', () => {
  it('returns the ticket id on success without touching the outbox', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => ({ rows: [{ id: 'safe-1' }] }),
      () => ({}),
    ]);
    const result = await safeOpenTestRunFailureTicket(fakePool, {
      runId: 'run-safe',
      testId: 'FA-3/case',
      name: 'fa3 case',
    });
    expect(result).toBe('safe-1');
    expect(calls.length).toBe(5);
  });

  it('swallows the error, enqueues an outbox retry, and returns null when ticket creation fails', async () => {
    const { pool: fakePool, calls } = scriptedPool([
      () => ({ rows: [] }), // existing check
      () => ({}), // BEGIN
      () => ({}), // set_config
      () => {
        throw new Error('db exploded');
      }, // main insert throws
      () => ({}), // ROLLBACK
      () => ({ rowCount: 1 }), // enqueueTestRunOutboxRetry insert
    ]);
    const result = await safeOpenTestRunFailureTicket(fakePool, {
      runId: 'run-fail',
      testId: 'FA-4/case',
      name: 'fa4 case',
      error: 'symptom',
      filePath: 'tests/fa4.spec.ts',
    });
    expect(result).toBeNull();
    expect(calls.length).toBe(6);
    expect(calls[5].sql).toMatch(/INSERT INTO systemtest_failure_outbox/);
    expect(calls[5].params).toEqual([
      'run-fail',
      'FA-4/case',
      null,
      'fa4 case',
      'symptom',
      'tests/fa4.spec.ts',
      0,
      'db exploded',
    ]);
  });

  it('logs (does not throw) when the outbox enqueue itself also fails', async () => {
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const { pool: fakePool } = scriptedPool([
      () => ({ rows: [] }),
      () => ({}),
      () => ({}),
      () => {
        throw new Error('db exploded again');
      },
      () => ({}),
      () => {
        throw new Error('outbox insert also failed');
      },
    ]);

    const result = await safeOpenTestRunFailureTicket(fakePool, {
      runId: 'run-fail-2',
      testId: 'FA-5/case',
      name: 'fa5 case',
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][1]).toMatch(/outbox enqueue failed/);

    errorSpy.mockRestore();
  });
});
