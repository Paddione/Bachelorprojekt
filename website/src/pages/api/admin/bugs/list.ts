import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listBugTickets } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const status   = url.searchParams.get('status')   || undefined;
  const category = url.searchParams.get('category') || undefined;
  const q        = url.searchParams.get('q')        || undefined;
  const brand    = process.env.BRAND || 'mentolder';

  const tickets = await listBugTickets({ status, category, q, brand }).catch(() => []);
  return new Response(JSON.stringify(tickets), {
    headers: { 'Content-Type': 'application/json' },
  });
};
