import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listOffice, createIdea, cleanupEphemeral } from '../../../lib/planning-office';

export const prerender = false;
const deny = () => new Response(JSON.stringify({ error: 'Unauthorized' }),
  { status: 401, headers: { 'content-type': 'application/json' } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return deny();
  try { return json({ items: await listOffice() }); }
  catch (e) { console.error('[api/planning-office GET]', e); return json({ error: 'fetch_failed' }, 500); }
};

export const POST: APIRoute = async ({ request }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return deny();
  try {
    const b = await request.json();
    if (!b?.title || !b?.brand) return json({ error: 'title_and_brand_required' }, 400);
    if (b.effort && !['klein','mittel','gross'].includes(b.effort)) return json({ error: 'bad_effort' }, 400);
    const extId = await createIdea({
      title: String(b.title), brand: String(b.brand), valueProp: b.valueProp,
      priority: b.priority, effort: b.effort, areas: Array.isArray(b.areas) ? b.areas : undefined,
    });
    return json({ extId }, 201);
  } catch (e) { console.error('[api/planning-office POST]', e); return json({ error: 'create_failed' }, 500); }
};

// Löscht alle nicht-gepinnten Ideen — vor jedem neuen Generierungslauf aufrufen.
export const DELETE: APIRoute = async ({ request }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return deny();
  try {
    const deleted = await cleanupEphemeral();
    return json({ deleted });
  } catch (e) { console.error('[api/planning-office DELETE]', e); return json({ error: 'cleanup_failed' }, 500); }
};
