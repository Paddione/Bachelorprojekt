import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getBook } from '../../../../../../lib/coaching-db';
import { deleteCollection } from '../../../../../../lib/knowledge-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const id = params.id as string;
  const book = await getBook(pool, id);
  if (!book) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(book), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const id = params.id as string;
  const book = await getBook(pool, id);
  if (!book) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

  // Delete book row first, then collection (cascades to chunks + drafts)
  await pool.query('DELETE FROM coaching.books WHERE id = $1', [id]);
  await deleteCollection(book.knowledgeCollectionId);

  return new Response(null, { status: 204 });
};
