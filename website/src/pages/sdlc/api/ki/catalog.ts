import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { KI_CATALOG } from '../../../../lib/ki-catalog';
import { KI_SERVICES } from '../../../../lib/ki-services';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Liefert den kuratierten Katalog der angebotenen Schnittstellen + die Service-Registry,
// damit das Dashboard Provider/Modell als Dropdown rendern kann (statt Freitext).
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return json({ catalog: KI_CATALOG, services: KI_SERVICES });
};
