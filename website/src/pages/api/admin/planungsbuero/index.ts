import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listOffice } from '../../../../lib/planning-office';

export const prerender = false;

const deny = () =>
  new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const GET: APIRoute = async ({ request }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return deny();
  try {
    const items = await listOffice();
    const planning = items.length;
    const ready = items.filter((i) => i.dorScore === 4).length;
    const blocked = items.filter(
      (i) => i.dependsOn.length > 0 && i.dorScore < 4,
    ).length;
    return json({ items, stats: { planning, ready, blocked } });
  } catch (e) {
    console.error('[api/admin/planungsbuero GET]', e);
    return json({ error: 'fetch_failed' }, 500);
  }
};
