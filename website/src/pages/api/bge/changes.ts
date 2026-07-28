import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listCollections } from '../../../lib/knowledge-db';
import { resolvePair, BgeRoutingError } from '../../../lib/bge-router';

export const prerender = false;

/**
 * T002426 — Aenderungs-Feed des Batch-Paars.
 *
 * Meldet, welche Ressourcen seit einem uebergebenen Zeitpunkt neu embedded
 * wurden, damit Agenten ihre Caches invalidieren koennen, statt bei jeder
 * Anfrage neu zu indexieren.
 *
 * Warum hier ueberhaupt der Router befragt wird, obwohl nur die Datenbank
 * gelesen wird: ein Feed, der "seit t hat sich nichts geaendert" meldet,
 * waehrend in Wahrheit gar nichts mehr embedded werden KANN, ist irrefuehrend.
 * Ist kein Paar erreichbar, antwortet der Feed 503 statt einer leeren Liste.
 * Die Erreichbarkeitsfrage stellt er dabei ueber `resolvePair` — er haelt
 * keinen eigenen Health-Check.
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async ({ request, url, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const sinceRaw = url.searchParams.get('since');
  if (!sinceRaw) return json({ error: 'query parameter since is required (ISO 8601)' }, 400);
  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    return json({ error: 'query parameter since must be a valid ISO 8601 timestamp' }, 400);
  }

  try {
    await resolvePair('batch', 'embed');
    const changed = (await listCollections())
      .filter(c => c.last_indexed_at != null && new Date(c.last_indexed_at).getTime() > since.getTime())
      .map(c => ({
        collection_id: c.id,
        name: c.name,
        source: c.source,
        chunk_count: c.chunk_count,
        embedded_at: new Date(c.last_indexed_at as Date).toISOString(),
      }))
      .sort((a, b) => a.embedded_at.localeCompare(b.embedded_at));
    return json({ since: since.toISOString(), changes: changed }, 200);
  } catch (err) {
    if (err instanceof BgeRoutingError) {
      return json({ error: 'embedding service unavailable' }, 503);
    }
    locals.requestLogger?.error?.({ err }, '[api/bge/changes]');
    return json({ error: 'change feed failed' }, 500);
  }
};
