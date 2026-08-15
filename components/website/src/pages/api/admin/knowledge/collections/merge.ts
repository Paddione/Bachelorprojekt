import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { mergeCollections, MixedEmbeddingModelError } from '../../../../../lib/knowledge-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { sourceIds?: unknown; name?: unknown; brand?: unknown; description?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!Array.isArray(body.sourceIds) || body.sourceIds.length < 2) {
    return new Response(
      JSON.stringify({ error: 'mindestens 2 Quellen erforderlich' }),
      { status: 400 },
    );
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return new Response(JSON.stringify({ error: 'name erforderlich' }), { status: 400 });
  }

  try {
    const merged = await mergeCollections({
      sourceIds: body.sourceIds as string[],
      name: body.name.trim(),
      brand: typeof body.brand === 'string' ? body.brand : null,
      description: typeof body.description === 'string' ? body.description : undefined,
    });
    return new Response(JSON.stringify(merged), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof MixedEmbeddingModelError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('cannot_delete') || msg.includes('not_found') || msg.includes('mindestens') || msg.includes('name erforderlich')) {
      return new Response(JSON.stringify({ error: msg }), { status: 400 });
    }
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return new Response(JSON.stringify({ error: 'name bereits vergeben' }), { status: 409 });
    }
    throw err;
  }
};
