import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { updateSessionStatus } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  let body: { status: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const allowed = ['active', 'paused', 'completed', 'abandoned'];
  if (!allowed.includes(body.status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const updated = await updateSessionStatus(
    pool, params.id as string, body.status as 'active' | 'paused' | 'completed' | 'abandoned',
    session.preferred_username,
  );
  if (!updated) return new Response(JSON.stringify({ error: 'Not found or transition not allowed' }), { status: 422, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ session: updated }), { headers: { 'content-type': 'application/json' } });
};
