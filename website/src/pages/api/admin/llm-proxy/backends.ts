import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  listBackends, createBackend, BACKEND_KINDS, KNOWN_FIXUPS,
  type NewBackend, type BackendKind, type Fixup,
} from '../../../../lib/llm-proxy-db';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

/** Validate & coerce a POST body into a NewBackend. Whitelist per design §4. */
function parseNew(body: Record<string, unknown>): { error: string } | { value: NewBackend } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const base_url = typeof body.base_url === 'string' ? body.base_url.trim() : '';
  if (!name || !base_url) return { error: 'name und base_url sind erforderlich' };
  if (!BACKEND_KINDS.includes(body.kind as BackendKind))
    return { error: 'kind muss llamacpp, lmstudio oder openai-remote sein' };
  const priority = Number(body.priority);
  if (!Number.isInteger(priority) || priority < 0)
    return { error: 'priority muss eine nicht-negative Ganzzahl sein' };
  const fixupsRaw = Array.isArray(body.fixups) ? body.fixups : [];
  if (!fixupsRaw.every((f) => KNOWN_FIXUPS.includes(f as Fixup)))
    return { error: 'fixups enthält einen unbekannten Wert' };
  const aliasesRaw = body.model_aliases;
  const model_aliases =
    aliasesRaw && typeof aliasesRaw === 'object' && !Array.isArray(aliasesRaw)
      ? (aliasesRaw as Record<string, string>)
      : {};
  const apiKeyEnv = typeof body.api_key_env === 'string' ? body.api_key_env.trim() : '';
  return {
    value: {
      name, kind: body.kind as BackendKind, base_url,
      api_key_env: apiKeyEnv || null,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      priority,
      fixups: fixupsRaw as Fixup[],
      model_aliases,
    },
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const backends = await listBackends();
    return json({ backends });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends] GET error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const parsed = parseNew(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const id = await createBackend(parsed.value);
    return json({ id }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      return json({ error: 'Ein Backend mit diesem Namen existiert bereits.' }, 409);
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends] POST error:');
    return json({ error: 'create_failed' }, 500);
  }
};
