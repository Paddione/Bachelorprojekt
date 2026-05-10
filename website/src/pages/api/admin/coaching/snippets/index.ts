import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSnippet, listSnippets } from '../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const filter = {
    bookId: url.searchParams.get('book_id') ?? undefined,
    clusterId: url.searchParams.get('cluster_id') ?? undefined,
    tag: url.searchParams.get('tag') ?? undefined,
  };
  const snippets = await listSnippets(pool, filter);
  return new Response(JSON.stringify(snippets), {
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
    bookId?: string;
    title?: string;
    body?: string;
    tags?: unknown;
    page?: number | null;
    clusterId?: string | null;
    knowledgeChunkId?: string | null;
  };
  if (!body.bookId || !body.title || !body.body) {
    return new Response(JSON.stringify({ error: 'bookId, title, body required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const snippet = await createSnippet(pool, {
    bookId: body.bookId,
    title: body.title,
    body: body.body,
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    page: body.page ?? null,
    clusterId: body.clusterId ?? null,
    knowledgeChunkId: body.knowledgeChunkId ?? null,
    createdBy: session.preferred_username,
  });
  return new Response(JSON.stringify(snippet), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
