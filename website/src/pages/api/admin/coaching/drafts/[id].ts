import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getDraft } from '../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const d = await getDraft(pool, id);
  if (!d) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
};
