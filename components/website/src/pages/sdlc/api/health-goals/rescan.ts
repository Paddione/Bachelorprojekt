import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { runHealthScan, HealthScanInputError } from '../../../../lib/sdlc/health-scan';
import { GOALS } from '../../../../lib/sdlc/goals-data';

export const prerender = false;

/** Ein Vollscan über alle 103 Ziele wäre ein HTTP-Timeout, kein Rescan. */
export const MAX_IDS_PER_REQUEST = 25;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  // Admin-Guard zuerst — vor jeder Validierung, vor jedem Spawn.
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body muss JSON sein' }, 400);
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return json({ error: 'ids: nicht-leeres Array erforderlich' }, 400);
  }
  const ids = body.ids as unknown[];
  if (ids.some((id) => typeof id !== 'string')) {
    return json({ error: 'ids: nur Strings erlaubt' }, 400);
  }
  if (ids.length > MAX_IDS_PER_REQUEST) {
    return json({ error: `maximal ${MAX_IDS_PER_REQUEST} IDs je Anfrage` }, 400);
  }

  // Doppelte Prüfung zur Route bewusst auch im Wrapper (der ist CLI-aufrufbar).
  const known = new Set(GOALS.map((g) => g.id));
  const unknownId = ids.find((id) => !known.has(id as string));
  if (unknownId) {
    return json({ error: `unbekannte Ziel-ID: ${unknownId}` }, 400);
  }

  try {
    const results = await runHealthScan(ids as string[]);
    return json({ results, scannedAt: new Date().toISOString() }, 200);
  } catch (err) {
    if (err instanceof HealthScanInputError) {
      return json({ error: err.message }, 400);
    }
    return json(
      { error: err instanceof Error ? err.message : 'Rescan fehlgeschlagen' },
      500,
    );
  }
};
