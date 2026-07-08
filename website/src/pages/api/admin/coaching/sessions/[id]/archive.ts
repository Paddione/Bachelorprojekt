import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { archiveSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const archived = await archiveSession(pool, params.id as string, session.preferred_username);
  if (!archived) return new Response(JSON.stringify({ error: 'Session nicht gefunden' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
