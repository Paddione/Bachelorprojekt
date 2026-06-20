import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setJsonSetting, KORE_FLAGS_KEY } from '../../../../lib/website-db';
import type { KoreFlags } from '../../../../lib/website-db';

// Persists the Kore (korczewski) homepage feature toggles as a JSON
// site_setting. Currently just the timeline switch.
export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  let body: KoreFlags;
  try {
    body = (await request.json()) as KoreFlags;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: 'expected a kore-flags object' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await setJsonSetting(BRAND, KORE_FLAGS_KEY, { timeline: !!body.timeline });
  } catch (err) {
    locals.requestLogger.error({ err }, '[kore-flags/save] DB error:');
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
