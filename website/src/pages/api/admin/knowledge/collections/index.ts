import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createCollection, listCollections } from '../../../../../lib/knowledge-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const cols = await listCollections();
  return new Response(JSON.stringify(cols), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { name?: string; description?: string; brand?: string | null; };
  if (!body.name?.trim()) {
    return new Response(JSON.stringify({ error: 'name erforderlich' }), { status: 400 });
  }
  try {
    const c = await createCollection({
      name: body.name.trim(),
      source: 'custom',
      description: body.description?.trim(),
      brand: body.brand ?? null,
    });
    return new Response(JSON.stringify(c), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('duplicate key')) {
      return new Response(JSON.stringify({ error: 'name bereits vergeben' }), { status: 409 });
    }
    throw err;
  }
};
