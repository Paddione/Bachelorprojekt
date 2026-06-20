import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { clarifyItem, CLARIFY_EFFORTS, DOR_KEYS, type Readiness } from '../../../../lib/planning-office';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, params , locals }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  const extId = params.extId!;
  try {
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== 'object') return json({ error: 'bad_body' }, 400);

    const commentBody = typeof b.commentBody === 'string' ? b.commentBody : '';

    const readinessUpdates: Readiness = {};
    if (b.readinessUpdates && typeof b.readinessUpdates === 'object') {
      for (const k of DOR_KEYS) if (k in b.readinessUpdates) readinessUpdates[k] = !!b.readinessUpdates[k];
    }

    const dependsOn = Array.isArray(b.dependsOn)
      ? b.dependsOn.filter((x: unknown): x is string => typeof x === 'string' && x.trim() !== '')
      : undefined;

    let effort: string | undefined;
    if (b.effort !== undefined && b.effort !== null && b.effort !== '') {
      if (!CLARIFY_EFFORTS.includes(b.effort)) return json({ error: 'bad_effort' }, 400);
      effort = b.effort;
    }

    const ok = await clarifyItem(extId, commentBody, readinessUpdates, { dependsOn, effort });
    return ok ? json({ ok: true }) : json({ error: 'not_found' }, 404);
  } catch (e) {
    locals.requestLogger.error({ e }, '[api/planning-office clarify]');
    return json({ error: 'clarify_failed' }, 500);
  }
};
