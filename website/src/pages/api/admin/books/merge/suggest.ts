import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { clusterByEmbedding } from '../../../../../lib/coaching-merge';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const suggestions = await clusterByEmbedding(pool, 0.75);
    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
