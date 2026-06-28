/**
 * test-infra-db.ts — Test-Infrastruktur DB-Schicht
 *
 * Extracted from website-db.ts (G-SIZE03 / T001293).
 * Manages test run records, per-test results, flake detection and Playwright reports.
 */

import { pool } from './db-pool';

// ── Test Runs ────────────────────────────────────────────────────────────────

export interface TestRun {
  id: string;
  tier: string;
  testIds: string | null;
  cluster: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'done' | 'error';
  pass: number | null;
  fail: number | null;
  skip: number | null;
  durationMs: number | null;
}

async function initTestRunsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_runs (
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
    )
  `);
}

export async function saveTestRun(params: {
  id: string;
  tier: string;
  testIds: string | null;
  cluster: string;
}): Promise<void> {
  await initTestRunsTable();
  await pool.query(
    `INSERT INTO test_runs (id, tier, test_ids, cluster) VALUES ($1, $2, $3, $4)`,
    [params.id, params.tier, params.testIds, params.cluster]
  );
}

export async function updateTestRun(params: {
  id: string;
  status: 'done' | 'error';
  pass: number;
  fail: number;
  skip: number;
  durationMs: number;
}): Promise<void> {
  await pool.query(
    `UPDATE test_runs
     SET status = $2, finished_at = now(), pass = $3, fail = $4, skip = $5, duration_ms = $6
     WHERE id = $1`,
    [params.id, params.status, params.pass, params.fail, params.skip, params.durationMs]
  );
}

export async function listTestRuns(limit = 20): Promise<TestRun[]> {
  await initTestRunsTable();
  const result = await pool.query(
    `SELECT id, tier, test_ids AS "testIds", cluster,
            started_at AS "startedAt", finished_at AS "finishedAt",
            status, pass, fail, skip, duration_ms AS "durationMs"
     FROM test_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ── Test Results (per-test history for flake detection + trends) ─────────────

export interface TestResultRow {
  testId: string;
  category: 'FA' | 'SA' | 'NFA' | 'AK' | 'E2E' | 'BATS';
  status: 'pass' | 'fail' | 'skip';
  durationMs?: number;
  message?: string;
}

export interface SavedTestResult {
  id: number;
  testId: string;
  category: string;
  status: string;
  durationMs: number | null;
  message: string | null;
}

export async function saveTestResults(
  runId: string,
  rows: TestResultRow[],
): Promise<SavedTestResult[]> {
  if (rows.length === 0) return [];
  const values: unknown[] = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 6;
    values.push(runId, r.testId, r.category, r.status, r.durationMs ?? null, r.message ?? null);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  }).join(',');
  const result = await pool.query<{
    id: number; test_id: string; category: string; status: string;
    duration_ms: number | null; message: string | null;
  }>(
    `INSERT INTO test_results (run_id, test_id, category, status, duration_ms, message)
     VALUES ${placeholders}
     RETURNING id, test_id, category, status, duration_ms, message`,
    values,
  );
  return result.rows.map(r => ({
    id: r.id,
    testId: r.test_id,
    category: r.category,
    status: r.status,
    durationMs: r.duration_ms,
    message: r.message,
  }));
}

export interface FlakeRow {
  testId: string;
  category: string;
  recentRuns: Array<{ runId: string; status: string; createdAt: string }>;
  failureRate: number;
}

export async function listFlakeWindow(limit: number): Promise<FlakeRow[]> {
  const result = await pool.query<{
    test_id: string;
    category: string;
    recent: Array<{ run_id: string; status: string; created_at: string }>;
  }>(
    `WITH ranked AS (
       SELECT test_id, category, run_id, status, created_at,
              row_number() OVER (PARTITION BY test_id ORDER BY created_at DESC) AS rn
         FROM test_results
     )
     SELECT test_id, category,
            jsonb_agg(jsonb_build_object('run_id', run_id, 'status', status, 'created_at', created_at) ORDER BY created_at DESC) AS recent
       FROM ranked
      WHERE rn <= $1
   GROUP BY test_id, category`,
    [limit],
  );
  return result.rows.map(row => {
    const recent = row.recent.map(r => ({ runId: r.run_id, status: r.status, createdAt: r.created_at }));
    const fails = recent.filter(r => r.status === 'fail').length;
    return {
      testId: row.test_id,
      category: row.category,
      recentRuns: recent,
      failureRate: recent.length === 0 ? 0 : fails / recent.length,
    };
  }).sort((a, b) => b.failureRate - a.failureRate);
}

export interface TrendRow { date: string; pass: number; fail: number; skip: number; p50DurationMs: number; p95DurationMs: number; }

export async function getTestRunTrend(days: number): Promise<TrendRow[]> {
  const result = await pool.query<{
    day: string; pass: string; fail: string; skip: string; p50: string; p95: string;
  }>(
    `SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
            sum(coalesce(pass, 0))::text AS pass,
            sum(coalesce(fail, 0))::text AS fail,
            sum(coalesce(skip, 0))::text AS skip,
            coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::text AS p50,
            coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::text AS p95
       FROM test_runs
      WHERE started_at >= now() - ($1 || ' days')::interval
   GROUP BY day
   ORDER BY day`,
    [days],
  );
  return result.rows.map(r => ({
    date: r.day,
    pass: Number(r.pass),
    fail: Number(r.fail),
    skip: Number(r.skip),
    p50DurationMs: Number(r.p50),
    p95DurationMs: Number(r.p95),
  }));
}

export async function listLastTestStatusPerTest(): Promise<Array<{ testId: string; status: string; createdAt: string }>> {
  const result = await pool.query<{ test_id: string; status: string; created_at: string }>(
    `SELECT DISTINCT ON (test_id) test_id, status, created_at FROM test_results ORDER BY test_id, created_at DESC`,
  );
  return result.rows.map(r => ({ testId: r.test_id, status: r.status, createdAt: r.created_at }));
}

// ── Playwright Reports ───────────────────────────────────────────────────────

export interface PlaywrightReport {
  id: number;
  createdAt: string;
  html: string;
}

async function initPlaywrightReportsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS playwright_reports (
      id         SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      html       TEXT NOT NULL
    )
  `);
}

export async function savePlaywrightReport(html: string): Promise<number> {
  await initPlaywrightReportsTable();
  const result = await pool.query(
    `INSERT INTO playwright_reports (html) VALUES ($1) RETURNING id`,
    [html]
  );
  // Keep only last 5
  await pool.query(
    `DELETE FROM playwright_reports WHERE id NOT IN (
       SELECT id FROM playwright_reports ORDER BY created_at DESC LIMIT 5
     )`
  );
  return result.rows[0].id;
}

export async function getLatestPlaywrightReport(): Promise<PlaywrightReport | null> {
  await initPlaywrightReportsTable();
  const result = await pool.query(
    `SELECT id, created_at AS "createdAt", html
     FROM playwright_reports ORDER BY created_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return {
    id: result.rows[0].id,
    createdAt: result.rows[0].createdAt.toISOString(),
    html: result.rows[0].html,
  };
}
