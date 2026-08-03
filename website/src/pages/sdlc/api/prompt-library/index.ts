// website/src/pages/api/admin/prompt-library/index.ts
// Prompt Library admin API — list (GET) and create (POST).
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { listPrompts, upsertPrompt } from '../../../../lib/prompt-library-db';

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, url , locals: _locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);
  // The compose-box dropdown only wants active templates; the admin manager
  // wants everything. Default to active-only so the dropdown is the simple path.
  const activeOnly = url.searchParams.get('all') !== '1';
  const prompts = await listPrompts(pool, BRAND, { activeOnly });
  return json({ prompts });
};

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

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
      brand: BRAND,
      title: body.title.trim(),
      body: body.body,
      category: body.category?.trim() || undefined,
      description: body.description ?? null,
      isActive: body.isActive ?? true,
      createdBy: session.email ?? session.sub,
    });
    return json({ prompt }, 201);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/prompt-library] create error:');
    return json({ error: 'create failed' }, 500);
  }
};
