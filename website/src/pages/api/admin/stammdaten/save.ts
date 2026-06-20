import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setJsonSetting, STAMMDATEN_KEY } from '../../../../lib/website-db';
import type { Stammdaten } from '../../../../lib/website-db';

// Persists the brand master-data (name, role, contact, address, UStId, …) as a
// JSON site_setting. Hero, footer, Kontakt and Impressum read these at render.
export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  let body: Stammdaten;
  try {
    body = (await request.json()) as Stammdaten;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: 'expected a stammdaten object' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await setJsonSetting(BRAND, STAMMDATEN_KEY, body);
  } catch (err) {
    locals.requestLogger.error({ err }, '[stammdaten/save] DB error:');
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
