import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateSnippet, deleteSnippet } from '../../../../../lib/coaching-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const id = params.id as string;
  const body = (await request.json()) as {
    title?: string;
    body?: string;
    tags?: string[];
    clusterId?: string | null;
  };
  const updated = await updateSnippet(pool, id, {
    title: body.title,
    body: body.body,
    tags: body.tags,
    clusterId: body.clusterId,
  });
  if (!updated) return new Response('Not Found', { status: 404 });

  return new Response(JSON.stringify(updated), {
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
  const ok = await deleteSnippet(pool, id);
  return new Response(null, { status: ok ? 204 : 404 });
};
