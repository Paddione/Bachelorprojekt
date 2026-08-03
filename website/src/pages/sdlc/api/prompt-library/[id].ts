// website/src/pages/api/admin/prompt-library/[id].ts
// Prompt Library admin API — update (PUT) and delete (DELETE) a single prompt.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { upsertPrompt, deletePrompt, getPrompt } from '../../../../lib/prompt-library-db';

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PUT: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);

  const existing = await getPrompt(pool, id);
  if (!existing) return json({ error: 'not found' }, 404);

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    category?: string;
    description?: string | null;
    isActive?: boolean;
  } | null;

  if (!body?.title?.trim() || !body?.body?.trim()) {
    return json({ error: 'title and body required' }, 400);
  }

  try {
    const prompt = await upsertPrompt(pool, {
      id,
      brand: BRAND,
      title: body.title.trim(),
      body: body.body,
      category: body.category?.trim() || existing.category,
      description: body.description ?? null,
      isActive: body.isActive ?? existing.isActive,
    });
    return json({ prompt });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/prompt-library/[id]] update error:');
    return json({ error: 'update failed' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params , locals: _locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);

  const affected = await deletePrompt(pool, id);
  if (affected === 0) return json({ error: 'not found' }, 404);
  return json({ ok: true });
};
