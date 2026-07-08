// website/src/pages/api/cron/error-log-retention.ts
import type { APIRoute } from 'astro';
import { getErrorLogPool } from '../../../lib/logging/error-log-store';

export const POST: APIRoute = async ({ request, locals }) => {
  // CRON_SECRET is a runtime value (set via the website-config ConfigMap), so
  // it is read from process.env at call time rather than the build-time
  // module top — see cors.ts for the same convention.
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // Delete errors older than 7 days
    const result = await getErrorLogPool().query(
      'DELETE FROM error_log WHERE ts < NOW() - INTERVAL \'7 days\''
    );

    locals.requestLogger.info(`[error-log-retention] Deleted ${result.rowCount} old entries`);

    return new Response(JSON.stringify({ deleted: result.rowCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[error-log-retention]');
    return new Response('Internal error', { status: 500 });
  }
};
