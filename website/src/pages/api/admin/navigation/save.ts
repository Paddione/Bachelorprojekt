import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setJsonSetting, NAV_KEY } from '../../../../lib/website-db';
import type { NavItem } from '../../../../lib/website-db';

// Persists the editable main navigation as a JSON site_setting.
// setJsonSetting → setSiteSetting inherits the T000304 run-once schema-init
// guard, so the DDL never runs on this hot path.
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  let body: NavItem[];
  try {
    body = (await request.json()) as NavItem[];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!Array.isArray(body)) {
    return new Response(JSON.stringify({ error: 'expected an array of nav items' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await setJsonSetting(BRAND, NAV_KEY, body);
  } catch (err) {
    console.error('[navigation/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
