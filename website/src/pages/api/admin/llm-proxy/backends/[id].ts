import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  updateBackend, deleteBackend, getBackend, countEnabledLocal,
  LLM_PROXY_KINDS, LLM_PROXY_FIXUPS, type BackendKind, type Fixup,
} from '../../../../../lib/llm-proxy-db';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

const PATCHABLE = ['name', 'kind', 'base_url', 'api_key_env', 'enabled', 'priority', 'fixups', 'model_aliases'];

function parsePatch(body: Record<string, unknown>): { error: string } | { patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === 'kind') {
      if (!LLM_PROXY_KINDS.includes(v as BackendKind)) return { error: 'ungültiger kind-Wert' };
      patch[k] = v;
    } else if (k === 'priority') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return { error: 'priority muss eine Ganzzahl ≥ 0 sein' };
      patch[k] = n;
    } else if (k === 'enabled') {
      patch[k] = Boolean(v);
    } else if (k === 'fixups') {
      if (!Array.isArray(v) || !v.every((f) => LLM_PROXY_FIXUPS.includes(f as Fixup)))
        return { error: 'fixups enthält einen unbekannten Wert' };
      patch[k] = v;
    } else if (k === 'model_aliases') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'model_aliases muss ein Objekt sein' };
      patch[k] = v;
    } else if (k === 'api_key_env') {
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

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const parsed = parsePatch(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  // Disabling the last enabled local backend is refused (same rule as delete).
  if (parsed.patch.enabled === false) {
    const row = await getBackend(id);
    if (row && row.enabled && row.kind !== 'openai-remote') {
      const remaining = await countEnabledLocal(id);
      if (remaining === 0)
        return json({ error: 'Das letzte aktive lokale Backend kann nicht deaktiviert werden.' }, 409);
    }
  }

  try {
    const ok = await updateBackend(id, parsed.patch);
    if (!ok) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      return json({ error: 'Ein Backend mit diesem Namen existiert bereits.' }, 409);
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends/[id]] PUT error:');
    return json({ error: 'update_failed' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  try {
    const row = await getBackend(id);
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.enabled && row.kind !== 'openai-remote') {
      const remaining = await countEnabledLocal(id);
      if (remaining === 0)
        return json({ error: 'Das letzte aktive lokale Backend kann nicht gelöscht werden.' }, 409);
    }
    const ok = await deleteBackend(id);
    if (!ok) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends/[id]] DELETE error:');
    return json({ error: 'delete_failed' }, 500);
  }
};
