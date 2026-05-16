import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { setActiveProvider, type KiConfig } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  let body: { provider: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const allowed: KiConfig['provider'][] = ['claude', 'openai', 'mistral', 'lumo'];
  if (!allowed.includes(body.provider as KiConfig['provider'])) {
    return new Response(JSON.stringify({ error: 'Invalid provider' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const brand = process.env.BRAND || 'mentolder';
  try {
    await setActiveProvider(pool, brand, body.provider as KiConfig['provider']);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Provider nicht gefunden' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
