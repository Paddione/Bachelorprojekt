import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getBook } from '../../../../../../lib/coaching-db';

const pool = new Pool();

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
