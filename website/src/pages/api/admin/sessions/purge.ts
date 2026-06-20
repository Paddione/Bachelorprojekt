import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { purgeOldSessions } from '../../../../lib/sessions/archive';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const cronToken = process.env.SESSIONS_CRON_TOKEN;
  const headerToken = request.headers.get('X-Cron-Token');
  let authorized = false;

  if (cronToken && headerToken && cronToken === headerToken) {
    authorized = true;
  }

  if (!authorized) {
    const session = await getSession(request.headers.get('cookie'));
    if (session && isAdmin(session)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await purgeOldSessions();
    return json(result, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/purge] POST error:');
    return json({ error: 'purge_failed' }, 500);
  }
};
