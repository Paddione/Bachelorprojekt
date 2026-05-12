import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createCluster, listClusters } from '../../../../../lib/coaching-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const bookId = url.searchParams.get('book_id') ?? undefined;
  const clusters = await listClusters(pool, { bookId });
  return new Response(JSON.stringify(clusters), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as {
    bookId?: string | null;
    name?: string;
    kind?: 'auto' | 'manual';
    parentId?: string | null;
  };
  if (!body.name) {
    return new Response(JSON.stringify({ error: 'name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cluster = await createCluster(pool, {
    bookId: body.bookId ?? null,
    name: body.name,
    kind: body.kind === 'auto' ? 'auto' : 'manual',
    parentId: body.parentId ?? null,
  });
  return new Response(JSON.stringify(cluster), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
