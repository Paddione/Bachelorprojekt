import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { promoteItem } from '../../../../lib/planning-office';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  try {
    const b = await request.json().catch(() => ({}));
    const res = await promoteItem(params.extId!, b?.override === true);
    if (!res.ok) return json({ error: res.reason }, res.reason === 'not_found' ? 404 : 409);
    return json({ ok: true });
  } catch (e) { console.error('[api/planning-office promote]', e); return json({ error: 'promote_failed' }, 500); }
};
