// POST /api/admin/systemtest/drain-outbox
//
// 5-minute cron entrypoint (see k3d/cronjob-systemtest-cleanup.yaml). Drains
// the failure-bridge outbox and runs the resolution-reconciler safety net in
// the same call so a single curl from the CronJob covers both follow-up paths.
//
// Auth: either a valid `X-Cron-Secret` header (in-cluster CronJob) OR an
// admin-authenticated browser session. Mirrors the billing CronJobs.
import type { APIRoute } from 'astro';

import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { drainOutbox } from '../../../../lib/systemtest/cleanup';
import { runReconciler } from '../../../../lib/systemtest/reconciler';
import { ensureQuestionnaireSchemaOnce } from '../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request , locals }) => {
  const cronSecret = request.headers.get('X-Cron-Secret');
  const session = await getSession(request.headers.get('cookie'));
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  if (!isCron && (!session || !isAdmin(session))) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // Defensive, idempotent schema-ensure: these CronJob endpoints import only
    // website-db (never questionnaire-db), so on a fresh pod that never served a
    // questionnaire/admin page the questionnaire_* / systemtest_* tables may not
    // exist yet and the queries below would 500 (T000406). Memoised — runs the
    // DDL at most once per process.
    await ensureQuestionnaireSchemaOnce(pool);
    const outbox = await drainOutbox(pool);
    const reconciler = await runReconciler(pool);
    return new Response(
      JSON.stringify({ ok: true, outbox, reconciler }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    locals.requestLogger.error({ msg }, '[systemtest/drain-outbox] failed:');
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
