import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  resolveModelCatalog,
  resolvePhaseResolutions,
} from '../../../../lib/sdlc/model-catalog';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Eine Auswahlliste für das KI-Deck: Proxy-Entdeckung ∪ provider_config,
// dedupliziert, plus die effektive Auflösung pro Phase (berechnet in
// lib/sdlc/model-catalog.ts — das Panel zeigt nur noch an).
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  try {
    const [catalog, resolutions] = await Promise.all([
      resolveModelCatalog(),
      resolvePhaseResolutions(),
    ]);
    return json({
      entries: catalog.entries,
      proxyOnline: catalog.proxyOnline,
      resolutions,
    });
  } catch (err) {
    // DB-Ausfall: die Auswahl darf nicht leer erscheinen, ohne es zu benennen.
    return json({ error: 'catalog_unavailable', message: String(err) }, 503);
  }
};
