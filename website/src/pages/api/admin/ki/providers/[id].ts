import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  updateProvider, deleteProvider, getProvider, countEnabledForSource, type Tier,
} from '../../../../../lib/ki-config-db';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

const TIERS: Tier[] = ['sonnet', 'haiku'];
const PATCHABLE = ['source', 'tier', 'priority', 'provider', 'model_id', 'base_url', 'max_concurrent', 'enabled'];

/** Whitelist + coerce an inbound PATCH body. Returns error string or a clean patch object. */
function parsePatch(body: Record<string, unknown>): { error: string } | { patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === 'tier') {
      if (!TIERS.includes(v as Tier)) return { error: 'tier muss sonnet oder haiku sein' };
      patch[k] = v;
    } else if (k === 'priority') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return { error: 'priority muss eine Ganzzahl ≥ 0 sein' };
      patch[k] = n;
    } else if (k === 'max_concurrent') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return { error: 'max_concurrent muss eine Ganzzahl ≥ 1 sein' };
      patch[k] = n;
    } else if (k === 'enabled') {
      patch[k] = Boolean(v);
    } else if (k === 'base_url') {
      const s = typeof v === 'string' ? v.trim() : '';
      patch[k] = s || null;
    } else {
      const s = typeof v === 'string' ? v.trim() : '';
      if (!s) return { error: `${k} darf nicht leer sein` };
      patch[k] = s;
    }
  }
  if (Object.keys(patch).length === 0) return { error: 'Keine gültigen Felder zum Aktualisieren.' };
  return { patch };
}

export const PUT: APIRoute = async ({ request, params }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const parsed = parsePatch(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const ok = await updateProvider(id, parsed.patch);
    if (!ok) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return json({ error: 'Diese (source, tier, priority)-Kombination existiert bereits.' }, 409);
    }
    console.error('[api/admin/ki/providers/[id]] PUT error:', err);
    return json({ error: 'update_failed' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  try {
    const row = await getProvider(id);
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.enabled) {
      const remaining = await countEnabledForSource(row.source, row.tier, id);
      if (remaining === 0) {
        return json(
          { error: `Letzter aktiver Provider für ${row.source} (${row.tier}) kann nicht gelöscht werden.` },
          409,
        );
      }
    }
    const ok = await deleteProvider(id);
    if (!ok) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error('[api/admin/ki/providers/[id]] DELETE error:', err);
    return json({ error: 'delete_failed' }, 500);
  }
};
