import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getSession as getCoachingSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const coachingSession = await getCoachingSession(pool, params.id as string);
  if (!coachingSession) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ session: coachingSession }), { headers: { 'content-type': 'application/json' } });
};
