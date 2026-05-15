import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getAuditLog } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const log = await getAuditLog(pool, params.id as string, limit);
  return new Response(JSON.stringify({ log }), { headers: { 'content-type': 'application/json' } });
};
