import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { getTicketGraph } from '../../../lib/ticket-graph';

export const prerender = false;

export const GET: APIRoute = async ({ request , locals }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const graph = await getTicketGraph();
    return new Response(JSON.stringify(graph), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    locals.requestLogger.error({ e }, '[api/tickets/graph]');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
