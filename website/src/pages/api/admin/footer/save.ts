import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setJsonSetting, FOOTER_KEY } from '../../../../lib/website-db';
import type { FooterConfig } from '../../../../lib/website-db';

// Persists the editable footer (columns + copyright) as a JSON site_setting.
// Contact data and the auto-generated Angebote column are resolved at render
// time, so only columns/copyright are stored here.
export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  let body: FooterConfig;
  try {
    body = (await request.json()) as FooterConfig;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.columns)) {
    return new Response(JSON.stringify({ error: 'expected { columns: [], copyright: string }' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await setJsonSetting(BRAND, FOOTER_KEY, body);
  } catch (err) {
    locals.requestLogger.error({ err }, '[footer/save] DB error:');
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
