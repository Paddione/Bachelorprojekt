import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection, updateContext7Config, type Context7Config } from '../../../../../../lib/knowledge-db';

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;
  const c = await getCollection(id);
  if (!c) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  if (c.source !== 'context7_docs') {
    return new Response(
      JSON.stringify({ error: 'context7_config ist nur für context7_docs-Sammlungen relevant' }),
      { status: 400 },
    );
  }

  const body = await request.json() as Partial<Context7Config>;

  if (!body.libraryId?.trim()) {
    return new Response(JSON.stringify({ error: 'libraryId erforderlich' }), { status: 400 });
  }
  if (!body.libraryId.startsWith('/')) {
    return new Response(
      JSON.stringify({ error: 'libraryId muss mit / beginnen (z.B. /withastro/docs)' }),
      { status: 400 },
    );
  }
  if (body.tokens !== undefined && (typeof body.tokens !== 'number' || body.tokens < 1)) {
    return new Response(JSON.stringify({ error: 'tokens muss eine positive Zahl sein' }), { status: 400 });
  }

  const config: Context7Config = {
    libraryId: body.libraryId.trim(),
    tokens: body.tokens ?? 20000,
  };

  try {
    await updateContext7Config(id, config);
    return new Response(JSON.stringify({ ok: true, context7_config: config }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'not_found')
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    throw err;
  }
};
