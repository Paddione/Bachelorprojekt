import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listDispatches, MAX_LIMIT } from '../../../../lib/sdlc/llm-proxy-request-log';

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
 * Liste der Dispatch-Mitschnitte, neueste zuerst — OHNE die Body-Spalten.
 * Die Bodies liefert ausschliesslich `requests/[id].ts`; kaemen sie hier mit,
 * zoege jeder Panel-Refresh zweistellige MB.
 */
export const GET: APIRoute = async ({ request, url, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;

  try {
    const { items, limit } = await listDispatches({
      limit: Number(url.searchParams.get('limit')) || undefined,
      ticket: url.searchParams.get('ticket'),
    });
    // `limit` und `capped` wandern mit: eine gekappte Liste soll als gekappt
    // erkennbar sein, statt wie das vollstaendige Ergebnis auszusehen.
    return json({ items, limit, max_limit: MAX_LIMIT, capped: items.length >= limit });
  } catch (err) {
    locals.requestLogger.error({ err }, '[sdlc/api/llm-proxy/requests] GET error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};
