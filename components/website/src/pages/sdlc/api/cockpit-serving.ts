import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { snapshotServing } from '../../../lib/sdlc/cockpit-serving';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const snapshot = await snapshotServing();
    return new Response(JSON.stringify(snapshot), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/cockpit-serving]');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
