// website/src/pages/api/admin/coaching/books/[id]/acceptance-rate.ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { acceptanceRateByBook } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const r = await acceptanceRateByBook(pool, params.id as string);
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
};
