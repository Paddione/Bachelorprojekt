import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { setActiveProvider } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';
import { KI_CATALOG } from '../../../../../lib/ki-catalog';

export const prerender = false;

const CATALOG_PROVIDERS = new Set<string>(KI_CATALOG.map(i => i.id));
const isAllowedProvider = (p: string) => CATALOG_PROVIDERS.has(p) || p.startsWith('custom_');

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  
  let body: { provider: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if (typeof body.provider !== 'string' || !isAllowedProvider(body.provider)) {
    return new Response(JSON.stringify({ error: 'Provider nicht gefunden' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }

  const brand = process.env.BRAND || 'mentolder';
  
  try {
    await setActiveProvider(pool, brand, body.provider);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Provider nicht gefunden' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
};
