import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listBooks } from '../../../../../lib/coaching-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let books: Awaited<ReturnType<typeof listBooks>> = [];
  try {
    books = await listBooks(pool);
  } catch (err) {
    // coaching schema may not exist on this cluster yet — return empty list
    console.warn('[api/admin/coaching/books] listBooks failed:', err instanceof Error ? err.message : err);
  }
  return new Response(JSON.stringify({ books }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
