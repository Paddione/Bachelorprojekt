import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection } from '../../../../../../lib/knowledge-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const collection = await getCollection(params.id!);
  if (!collection) return new Response(JSON.stringify({ error: 'collection not found' }), { status: 404 });
  if (collection.source === 'custom') {
    return new Response(JSON.stringify({ error: 'reindex only for built-in collections' }), { status: 403 });
  }

  const env = process.env.BRAND ?? 'mentolder';
  const cmd = `task knowledge:reindex ENV=${env} COLLECTION=${collection.source}`;
  return new Response(JSON.stringify({ message: 'run this command', cmd }), { status: 202 });
};
