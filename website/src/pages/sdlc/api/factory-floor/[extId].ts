import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { getTicketDetail } from '../../../lib/factory-floor';

export const prerender = false;

export const GET: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const extId = params.extId ?? '';
  try {
    const detail = await getTicketDetail(extId);
    if (!detail) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detail), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-floor/[extId]]');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
