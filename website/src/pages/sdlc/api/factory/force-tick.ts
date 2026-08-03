// website/src/pages/api/factory/force-tick.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { writeControl } from '../../../lib/factory-floor';

export const prerender = false;

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  const requestedAt = new Date().toISOString();
  try {
    // Global (brand IS NULL) control flag; wakeup.sh reads + clears it next tick.
    await writeControl('force-tick-requested', requestedAt, session!.preferred_username);
    return new Response(JSON.stringify({ ok: true, requestedAt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory/force-tick] POST error:');
    return new Response(JSON.stringify({ error: 'force_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
