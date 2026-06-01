// POST /api/admin/systemtest/cleanup-fixtures
//
// Hourly cron entrypoint (see k3d/cronjob-systemtest-cleanup.yaml). Runs the
// fixture purge + magic-token sweep against the website's primary DB pool.
//
// Auth: either a valid `X-Cron-Secret` header (used by the in-cluster CronJob)
// OR an admin-authenticated browser session. Mirrors the billing CronJobs'
// auth pattern (see api/admin/billing/dunning/run.ts).
import type { APIRoute } from 'astro';

import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { purgeFixturesFor, purgeExpiredMagicTokens } from '../../../../lib/systemtest/cleanup';
import { ensureQuestionnaireSchemaOnce } from '../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request }) => {
  const cronSecret = request.headers.get('X-Cron-Secret');
  const session = await getSession(request.headers.get('cookie'));
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  if (!isCron && (!session || !isAdmin(session))) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // Defensive, idempotent schema-ensure: this CronJob endpoint imports only
    // website-db (never questionnaire-db), so on a fresh pod that never served a
    // questionnaire/admin page the questionnaire_* / systemtest_* tables may not
    // exist yet and the sweeps below would 500 (T000406). Memoised — runs the
    // DDL at most once per process.
    await ensureQuestionnaireSchemaOnce(pool);
    const fixtures = await purgeFixturesFor(pool, { graceHours: 24 });
    const tokens = await purgeExpiredMagicTokens(pool);
    return new Response(
      JSON.stringify({ ok: true, ...fixtures, magicTokens: tokens.purged }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[systemtest/cleanup-fixtures] failed:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
