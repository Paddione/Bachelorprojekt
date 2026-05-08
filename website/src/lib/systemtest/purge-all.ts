// website/src/lib/systemtest/purge-all.ts
//
// Test-bracketed purge — wipes ALL is_test_data=true rows + side-tables
// (questionnaire scaffolding, systemtest plumbing, optional test_run history,
// and a customer allowlist sweep). Designed to run BEFORE and AFTER every
// Playwright lifecycle on prod via Playwright globalSetup/globalTeardown +
// Taskfile defense-in-depth curl wrappers.
//
// Complementary to `cleanup.ts`'s `purgeFixturesFor`: that one is the hourly
// "soft" CronJob that respects a grace window for in-flight assignments;
// this one is the "hard" bracket — every is_test_data=true row, no grace,
// every run.
//
// All heavy lifting lives in PG: `tickets.fn_purge_test_data()` (see
// scripts/one-shot/2026-05-08-purge-test-data.sql). This module is a thin
// caller that returns the JSONB counts to the API/Taskfile layer.

import type { Pool } from 'pg';

/** Per-table delete counts returned by tickets.fn_purge_test_data(). Keys
 *  are dynamic so we type as a record. */
export type PurgeAllCounts = Record<string, number>;

/**
 * Invoke `tickets.fn_purge_test_data()` and return the parsed JSONB counts.
 *
 * Idempotent — running twice on a clean DB returns all-zero counts. Errors
 * propagate; callers (the API endpoint and the Playwright globalSetup) want
 * the failure to surface so a broken purge doesn't silently corrupt a run.
 */
export async function purgeAllTestData(pool: Pool): Promise<PurgeAllCounts> {
  const r = await pool.query<{ fn_purge_test_data: PurgeAllCounts }>(
    'SELECT tickets.fn_purge_test_data() AS fn_purge_test_data',
  );
  return r.rows[0]?.fn_purge_test_data ?? {};
}
