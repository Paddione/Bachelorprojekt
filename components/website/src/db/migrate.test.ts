import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

// Controlled fs mock: readdirSync returns a configurable file list, and
// readFileSync returns a fixed SQL string per file. Configured per test via
// the `mockFiles` module-level variable so we don't depend on the real
// migrations/ directory contents.
let mockFiles: string[] = [];

vi.mock('node:fs', () => ({
  existsSync: () => true,
  readdirSync: () => mockFiles,
  readFileSync: (path: string) => `-- sql body for ${String(path)}`,
}));

import { runMigrations, ALREADY_EXISTS_SQLSTATES } from './migrate';

type QueryCall = { sql: string; params?: unknown[] };

interface MockPoolOptions {
  tracked?: string[];
  // filename (from the SQL body marker) -> error to throw on the body query
  failOn?: Record<string, { code: string; message: string }>;
}

function createMockPool(opts: MockPoolOptions = {}) {
  const tracked = opts.tracked ?? [];
  const failOn = opts.failOn ?? {};
  const calls: QueryCall[] = [];

  const query = vi.fn(
    async (sql: string, params?: unknown[]): Promise<QueryResult<{ filename: string }>> => {
      calls.push({ sql, params });

      if (/^SELECT filename FROM schema_migrations/.test(sql)) {
        return {
          rows: tracked.map((filename) => ({ filename })),
        } as QueryResult<{ filename: string }>;
      }

      // Migration body queries are the fixture strings produced by the mocked
      // readFileSync: "-- sql body for <path>". Find a matching failOn entry
      // by checking whether the path ends with the configured filename.
      for (const [filename, err] of Object.entries(failOn)) {
        if (sql.includes(`for `) && sql.endsWith(filename)) {
          const e = new Error(err.message) as Error & { code: string };
          e.code = err.code;
          throw e;
        }
      }

      return { rows: [] } as unknown as QueryResult<{ filename: string }>;
    },
  );

  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));

  return { query, connect, calls, release } as unknown as Pool & {
    calls: QueryCall[];
    release: typeof release;
  };
}

beforeEach(() => {
  mockFiles = [];
});

describe('runMigrations', () => {
  it('applies files in lexicographic sort order and ignores non-.sql entries', async () => {
    mockFiles = ['20260703_b.sql', '20260520_a.sql', 'error-log-schema.test.ts'];
    const pool = createMockPool();

    await runMigrations(pool);

    const bodyCalls = pool.calls
      .map((c) => c.sql)
      .filter((sql) => sql.startsWith('-- sql body for'));
    expect(bodyCalls).toEqual([
      expect.stringContaining('20260520_a.sql'),
      expect.stringContaining('20260703_b.sql'),
    ]);
  });

  it('skips already-tracked files and only runs untracked ones', async () => {
    mockFiles = ['20260520_a.sql', '20260703_b.sql'];
    const pool = createMockPool({ tracked: ['20260520_a.sql'] });

    await runMigrations(pool);

    const bodyCalls = pool.calls
      .map((c) => c.sql)
      .filter((sql) => sql.startsWith('-- sql body for'));
    expect(bodyCalls).toHaveLength(1);
    expect(bodyCalls[0]).toContain('20260703_b.sql');

    const inserts = pool.calls.filter((c) => c.sql.startsWith('INSERT INTO schema_migrations'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual(['20260703_b.sql']);
  });

  it.each(['42P07', '42710', '42701'])(
    'backfills a file that fails with %s (already exists) and continues to the next file',
    async (code) => {
      mockFiles = ['20260520_a.sql', '20260703_b.sql'];
      const pool = createMockPool({
        failOn: { '20260520_a.sql': { code, message: 'already exists' } },
      });

      await expect(runMigrations(pool)).resolves.toBeUndefined();

      expect(ALREADY_EXISTS_SQLSTATES.has(code)).toBe(true);

      const bodyCalls = pool.calls
        .map((c) => c.sql)
        .filter((sql) => sql.startsWith('-- sql body for'));
      // Both files' body queries were attempted.
      expect(bodyCalls.some((sql) => sql.includes('20260520_a.sql'))).toBe(true);
      expect(bodyCalls.some((sql) => sql.includes('20260703_b.sql'))).toBe(true);

      const inserts = pool.calls.filter((c) => c.sql.startsWith('INSERT INTO schema_migrations'));
      const insertedFiles = inserts.map((c) => c.params?.[0]);
      expect(insertedFiles).toContain('20260520_a.sql');
      expect(insertedFiles).toContain('20260703_b.sql');
    },
  );

  it('aborts the run on a real error outside the allowlist and does not track the file', async () => {
    mockFiles = ['20260520_a.sql', '20260703_b.sql'];
    const pool = createMockPool({
      failOn: { '20260520_a.sql': { code: '42601', message: 'syntax error' } },
    });

    await expect(runMigrations(pool)).rejects.toThrow(/20260520_a\.sql.*syntax error/s);

    const bodyCalls = pool.calls
      .map((c) => c.sql)
      .filter((sql) => sql.startsWith('-- sql body for'));
    // The second file must never have been attempted.
    expect(bodyCalls.some((sql) => sql.includes('20260703_b.sql'))).toBe(false);

    const inserts = pool.calls.filter((c) => c.sql.startsWith('INSERT INTO schema_migrations'));
    expect(inserts).toHaveLength(0);
  });

  it('bootstraps the schema_migrations table before the tracking SELECT', async () => {
    mockFiles = [];
    const pool = createMockPool();

    await runMigrations(pool);

    const firstCall = pool.calls[0];
    expect(firstCall.sql).toMatch(/CREATE TABLE IF NOT EXISTS schema_migrations/);
    const selectIndex = pool.calls.findIndex((c) =>
      /^SELECT filename FROM schema_migrations/.test(c.sql),
    );
    expect(selectIndex).toBeGreaterThan(0);
  });

  it('runs the whole migration pass on a single dedicated client (not round-robin pool.query)', async () => {
    mockFiles = ['20260520_a.sql'];
    const pool = createMockPool();

    await runMigrations(pool);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(pool.release).toHaveBeenCalledTimes(1);
  });
});
