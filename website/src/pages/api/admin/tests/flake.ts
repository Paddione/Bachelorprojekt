import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listFlakeWindow } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const limit = Math.max(3, Math.min(Number(url.searchParams.get('limit') ?? 10), 50));
  const flakes = await listFlakeWindow(limit);
  return new Response(JSON.stringify({ window: limit, tests: flakes }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
