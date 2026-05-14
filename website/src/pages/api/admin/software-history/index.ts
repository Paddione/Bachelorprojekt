import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listHistory, listStack, trackingPool as pool } from '../../../../lib/software-history-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const sp = url.searchParams;
  const filters = {
    kind:   sp.get('kind')   ?? undefined,
    area:   sp.get('area')   ?? undefined,
    brand:  sp.get('brand')  ?? undefined,
    q:      sp.get('q')      ?? undefined,
    limit:  sp.get('limit')  ? parseInt(sp.get('limit')!, 10)  : undefined,
    offset: sp.get('offset') ? parseInt(sp.get('offset')!, 10) : undefined,
  };

  const [stack, events] = await Promise.all([listStack(pool), listHistory(pool, filters)]);
  return new Response(JSON.stringify({ stack, events }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
