import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { listChunksForBook } from '../../../../../../lib/coaching-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const id = params.id as string;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const chunks = await listChunksForBook(pool, id, { limit, offset });
  return new Response(JSON.stringify({ chunks, limit, offset }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
