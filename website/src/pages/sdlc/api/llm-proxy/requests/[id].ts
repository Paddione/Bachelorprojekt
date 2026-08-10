import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getDispatch } from '../../../../../lib/sdlc/llm-proxy-request-log';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

/**
 * Ein Mitschnitt mit vollem Prompt und voller Antwort. Wird erst beim Oeffnen
 * des Detail-Bereichs geholt, nie fuer die Liste.
 */
export const GET: APIRoute = async ({ request, params, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  try {
    const row = await getDispatch(id);
    // Eine unbekannte Kennung ergibt 404 — nicht eine leere Zeile, die im Panel
    // wie ein Mitschnitt ohne Inhalt aussaehe.
    if (!row) return json({ error: 'not_found' }, 404);
    return json(row);
  } catch (err) {
    locals.requestLogger.error({ err }, '[sdlc/api/llm-proxy/requests/[id]] GET error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};
