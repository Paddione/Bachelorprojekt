import { describe, test, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';

// test-infra-db.ts imports a module-level `pool` singleton from './db-pool'
// (not injected per-call, unlike coaching-db.ts). We monkeypatch the real
// Pool's `query` method so the module's calls are served by a pg-mem backed
// pool instead of a live Postgres connection.
//
// pg-mem 3.0.14 cannot parse `CREATE TABLE IF NOT EXISTS ... (col TYPE
// PRIMARY KEY, col TYPE NOT NULL DEFAULT now(), ...)` (AST-coverage error on
// the constraint list) — this is a pg-mem parser limitation, not a bug in
// test-infra-db.ts (the DDL is valid Postgres and runs fine against real
// Postgres/CI). We short-circuit those lazy `init*Table()` calls (the schema
// is already created below with the exact same column set) and forward
// every other statement to pg-mem.
import { pool as realPool } from './db-pool';
import * as tdb from './test-infra-db';

let pgmem: ReturnType<typeof newDb>;
let memPool: Pool;

beforeAll(async () => {
  pgmem = newDb();

  pgmem.public.none(`
    CREATE TABLE test_runs (
      id           TEXT PRIMARY KEY,
      tier         TEXT NOT NULL,
      test_ids     TEXT,
      cluster      TEXT NOT NULL,
      started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at  TIMESTAMPTZ,
      status       TEXT NOT NULL DEFAULT 'running',
      pass         INT,
      fail         INT,
      skip         INT,
      duration_ms  INT
    );
    CREATE TABLE test_results (
      id          SERIAL PRIMARY KEY,
      run_id      TEXT NOT NULL,
      test_id     TEXT NOT NULL,
      category    TEXT NOT NULL,
      status      TEXT NOT NULL,
      duration_ms INT,
      message     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE playwright_reports (
      id         SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      html       TEXT NOT NULL
    );
  `);

  const { Pool: MemPool } = pgmem.adapters.createPg();
  memPool = new MemPool() as unknown as Pool;

  (realPool as unknown as { query: Pool['query'] }).query = ((
    sql: string,
    params?: unknown[],
  ) => {
    // The module's lazy `CREATE TABLE IF NOT EXISTS` calls hit a pg-mem
    // parser limitation (see comment above) — the schema already exists
    // above with matching columns, so it's safe to no-op these.
    if (/^\s*CREATE TABLE/i.test(sql)) {
      return Promise.resolve({ rows: [] });
    }
    return memPool.query(sql, params as unknown[]);
  }) as unknown as Pool['query'];
});

afterAll(async () => {
  await memPool.end();
});

beforeEach(async () => {
  await memPool.query('TRUNCATE test_runs');
  await memPool.query('TRUNCATE test_results RESTART IDENTITY');
  await memPool.query('TRUNCATE playwright_reports RESTART IDENTITY');
});

describe('test-infra-db: test runs', () => {
  test('saveTestRun inserts a running row; listTestRuns returns it', async () => {
    await tdb.saveTestRun({ id: 'run-1', tier: 'unit', testIds: null, cluster: 'k3d-dev' });
    const runs = await tdb.listTestRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('run-1');
    expect(runs[0].status).toBe('running');
    expect(runs[0].pass).toBeNull();
  });

  test('updateTestRun flips status to done and sets counters', async () => {
    await tdb.saveTestRun({ id: 'run-2', tier: 'e2e', testIds: 'FA-1,FA-2', cluster: 'fleet' });
    await tdb.updateTestRun({ id: 'run-2', status: 'done', pass: 5, fail: 1, skip: 0, durationMs: 12345 });
    const runs = await tdb.listTestRuns();
    const run = runs.find((r) => r.id === 'run-2')!;
    expect(run.status).toBe('done');
    expect(run.pass).toBe(5);
    expect(run.fail).toBe(1);
    expect(run.durationMs).toBe(12345);
    expect(run.finishedAt).not.toBeNull();
  });

  test('listTestRuns respects the limit parameter', async () => {
    await tdb.saveTestRun({ id: 'run-a', tier: 'unit', testIds: null, cluster: 'c' });
    await tdb.saveTestRun({ id: 'run-b', tier: 'unit', testIds: null, cluster: 'c' });
    await tdb.saveTestRun({ id: 'run-c', tier: 'unit', testIds: null, cluster: 'c' });
    const limited = await tdb.listTestRuns(2);
    expect(limited).toHaveLength(2);
  });
});

describe('test-infra-db: test results', () => {
  test('saveTestResults returns [] for an empty rows array without querying', async () => {
    const result = await tdb.saveTestResults('run-x', []);
    expect(result).toEqual([]);
  });

  test('saveTestResults inserts multiple rows and returns mapped SavedTestResult[]', async () => {
    const saved = await tdb.saveTestResults('run-1', [
      { testId: 'FA-1', category: 'FA', status: 'pass', durationMs: 100 },
      { testId: 'FA-2', category: 'FA', status: 'fail', message: 'boom' },
    ]);
    expect(saved).toHaveLength(2);
    expect(saved[0].testId).toBe('FA-1');
    expect(saved[0].status).toBe('pass');
    expect(saved[0].durationMs).toBe(100);
    expect(saved[1].message).toBe('boom');
  });

  test('listLastTestStatusPerTest returns the most recent status per test id', async () => {
    await tdb.saveTestResults('run-1', [{ testId: 'FA-1', category: 'FA', status: 'pass' }]);
    await new Promise((r) => setTimeout(r, 5));
    await tdb.saveTestResults('run-2', [{ testId: 'FA-1', category: 'FA', status: 'fail' }]);
    const last = await tdb.listLastTestStatusPerTest();
    expect(last).toHaveLength(1);
    expect(last[0].status).toBe('fail');
  });
});

describe('test-infra-db: playwright reports', () => {
  test('getLatestPlaywrightReport returns null when none saved', async () => {
    const report = await tdb.getLatestPlaywrightReport();
    expect(report).toBeNull();
  });

  test('savePlaywrightReport + getLatestPlaywrightReport round-trips the latest html', async () => {
    await tdb.savePlaywrightReport('<html>1</html>');
    const id2 = await tdb.savePlaywrightReport('<html>2</html>');
    const latest = await tdb.getLatestPlaywrightReport();
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(id2);
    expect(latest!.html).toBe('<html>2</html>');
  });

  test('savePlaywrightReport keeps only the last 5 reports', async () => {
    for (let i = 0; i < 7; i++) {
      await tdb.savePlaywrightReport(`<html>${i}</html>`);
    }
    const count = await memPool.query('SELECT count(*)::int AS c FROM playwright_reports');
    expect(count.rows[0].c).toBe(5);
  });
});

// pg-mem 3.0.14 does not implement window functions (`OVER (...)`) nor
// `date_trunc`/`percentile_cont`, so listFlakeWindow / getTestRunTrend's raw
// SQL can't execute against it. We instead stub pool.query for these two
// describe blocks to return the exact row shape Postgres would produce,
// which exercises the (non-trivial) JS-side mapping/sorting logic in the
// module — the part of these functions actually worth covering.
describe('test-infra-db: listFlakeWindow (JS-side mapping, pool stubbed)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('computes failureRate per test and sorts by failureRate descending', async () => {
    vi.spyOn(realPool, 'query').mockResolvedValue({
      rows: [
        {
          test_id: 'FA-1',
          category: 'FA',
          recent: [
            { run_id: 'run-3', status: 'fail', created_at: '2026-06-30T00:00:00Z' },
            { run_id: 'run-2', status: 'fail', created_at: '2026-06-29T00:00:00Z' },
            { run_id: 'run-1', status: 'pass', created_at: '2026-06-28T00:00:00Z' },
          ],
        },
        {
          test_id: 'FA-2',
          category: 'FA',
          recent: [
            { run_id: 'run-1', status: 'pass', created_at: '2026-06-28T00:00:00Z' },
          ],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof realPool.query>>);

    const flakes = await tdb.listFlakeWindow(10);
    expect(flakes).toHaveLength(2);
    // FA-1 has failureRate 2/3, FA-2 has failureRate 0 — sorted descending.
    expect(flakes[0].testId).toBe('FA-1');
    expect(flakes[0].failureRate).toBeCloseTo(2 / 3, 5);
    expect(flakes[0].recentRuns).toHaveLength(3);
    expect(flakes[1].testId).toBe('FA-2');
    expect(flakes[1].failureRate).toBe(0);
  });

  test('failureRate is 0 when a test has no recent runs', async () => {
    vi.spyOn(realPool, 'query').mockResolvedValue({
      rows: [{ test_id: 'FA-3', category: 'FA', recent: [] }],
    } as unknown as Awaited<ReturnType<typeof realPool.query>>);

    const flakes = await tdb.listFlakeWindow(5);
    expect(flakes[0].failureRate).toBe(0);
  });
});

describe('test-infra-db: getTestRunTrend (JS-side mapping, pool stubbed)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('maps and numeric-coerces per-day aggregate rows', async () => {
    vi.spyOn(realPool, 'query').mockResolvedValue({
      rows: [
        { day: '2026-06-30', pass: '14', fail: '2', skip: '1', p50: '500', p95: '1500' },
      ],
    } as unknown as Awaited<ReturnType<typeof realPool.query>>);

    const trend = await tdb.getTestRunTrend(7);
    expect(trend).toEqual([
      { date: '2026-06-30', pass: 14, fail: 2, skip: 1, p50DurationMs: 500, p95DurationMs: 1500 },
    ]);
  });

  test('returns [] when the query yields no rows', async () => {
    vi.spyOn(realPool, 'query').mockResolvedValue({ rows: [] } as unknown as Awaited<ReturnType<typeof realPool.query>>);
    const trend = await tdb.getTestRunTrend(1);
    expect(trend).toEqual([]);
  });
});
