// POST /api/admin/systemtest/purge-all-test-data
//
// Test-bracketed purge endpoint. Called by Playwright globalSetup +
// globalTeardown (and by the Taskfile's `test:e2e` wrapper as defense-
// in-depth) to fully wipe is_test_data=true rows + their associated side
// tables. Complementary to /cleanup-fixtures (which respects a grace window
// for in-flight assignments) — this one ignores the grace.
//
// Auth: identical to /cleanup-fixtures — either an X-Cron-Secret header
// matching CRON_SECRET, or an admin-authenticated browser session. 405 on
// non-POST so casual GETs from the browser return cleanly.

import type { APIRoute } from 'astro';

import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { purgeAllTestData } from '../../../../lib/systemtest/purge-all';

export const POST: APIRoute = async ({ request }) => {
  const cronSecret = request.headers.get('X-Cron-Secret');
  const session = await getSession(request.headers.get('cookie'));
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  if (!isCron && (!session || !isAdmin(session))) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const counts = await purgeAllTestData(pool);
    return new Response(
      JSON.stringify({ ok: true, counts }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[systemtest/purge-all-test-data] failed:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const ALL: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }
  // Should not be reachable — POST is handled above. Defensive 405 for any
  // other verb (HEAD, OPTIONS, etc.) so we never accidentally serve content.
  return new Response('Method Not Allowed', { status: 405 });
};
