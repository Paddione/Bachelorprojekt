import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { getFloor } from '../../lib/factory-floor';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
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
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/factory-floor]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
