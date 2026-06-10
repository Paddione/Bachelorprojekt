import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { patchItem, DOR_KEYS, type Readiness } from '../../../lib/planning-office';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const PATCH: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) return json({ error: 'Unauthorized' }, 401);
  const extId = params.extId!;
  try {
    const b = await request.json();
    if (b.effort && !['klein','mittel','gross'].includes(b.effort)) return json({ error: 'bad_effort' }, 400);
    let readiness: Readiness | undefined;
    if (b.readiness && typeof b.readiness === 'object') {
      readiness = {};
      for (const k of DOR_KEYS) if (k in b.readiness) readiness[k] = !!b.readiness[k];
    }
    const ok = await patchItem(extId, {
      valueProp: b.valueProp, priority: b.priority, effort: b.effort,
      areas: Array.isArray(b.areas) ? b.areas : undefined,
      dependsOn: Array.isArray(b.dependsOn) ? b.dependsOn : undefined,
      rank: typeof b.rank === 'number' ? b.rank : undefined, readiness,
    });
    return ok ? json({ ok: true }) : json({ error: 'not_found_or_noop' }, 404);
  } catch (e) { console.error('[api/planning-office PATCH]', e); return json({ error: 'patch_failed' }, 500); }
};
