import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { getFloor } from '../../lib/factory-floor';
import { getPrCiStatus } from '../../lib/github-ci';

export const prerender = false;

export const GET: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const slotsCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);
  try {
    const payload = await getFloor(slotsCap);
    // Enrich devflow tickets currently in deploy with their live CI verdict.
    await Promise.all(
      payload.hall
        .filter((h) => h.driver === 'devflow' && h.phase === 'deploy' && h.prNumber != null)
        .map(async (h) => { h.ciStatus = await getPrCiStatus(h.prNumber as number); }),
    );
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-floor]');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
