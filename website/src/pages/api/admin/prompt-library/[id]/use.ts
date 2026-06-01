// website/src/pages/api/admin/prompt-library/[id]/use.ts
// Prompt Library admin API — record a use (POST), bumping usage_count.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { incrementUsage } from '../../../../../lib/prompt-library-db';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);

  const usageCount = await incrementUsage(pool, id);
  if (usageCount === null) return json({ error: 'not found' }, 404);
  return json({ usageCount });
};
