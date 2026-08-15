import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { pool } from '../../../../../../lib/website-db';
import { generateSessionSummary } from '../../../../../../lib/coaching-summary';

export const prerender = false;

/**
 * POST /api/admin/coaching/sessions/:id/summary
 *
 * Erzeugt (oder liefert idempotent) die LLM-Zusammenfassung der Session.
 * force=true im Body umgeht die Idempotenz. DSGVO: Inhalte gehen ausschliess-
 * lich ueber den on-premises-geguardeten Session-Agent-Pfad — ein externer
 * Provider fuehrt zu DataResidencyError (Call wird nie gesendet).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;

  let force = false;
  try {
    const body = await request.json().catch(() => null);
    force = body?.force === true;
  } catch { /* body optional */ }

  const brand = process.env.BRAND || 'mentolder';

  try {
    const result = await generateSessionSummary(pool, { sessionId, brand, force });
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/nicht gefunden/i.test(msg)) {
      return new Response(JSON.stringify({ error: 'Session nicht gefunden' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    if (/Kein KI-Provider konfiguriert/i.test(msg)) {
      return new Response(JSON.stringify({ error: msg }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    if (/Schritt|Inhalt/i.test(msg)) {
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if (/on-premises/i.test(msg)) {
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { 'content-type': 'application/json' } });
    }
    throw err;
  }
};
