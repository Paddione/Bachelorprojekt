import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection, deleteCollection } from '../../../../../../lib/knowledge-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const c = await getCollection(params.id!);
  if (!c) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  return new Response(JSON.stringify(c), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    await deleteCollection(params.id!);
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    if (err instanceof Error && /custom/i.test(err.message))
      return new Response(JSON.stringify({ error: err.message }), { status: 403 });
    if (err instanceof Error && err.message === 'not_found')
      return new Response(JSON.stringify({ error: err.message }), { status: 404 });
    throw err;
  }
};
