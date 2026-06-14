import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  listProviders, listHealth, createProvider, type NewProvider, type Tier,
} from '../../../../lib/ki-config-db';

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

/** Validate a POST body into a NewProvider; returns an error string or the parsed value. */
function parseNew(body: Record<string, unknown>): { error: string } | { value: NewProvider } {
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const source = str('source');
  const provider = str('provider');
  const model_id = str('model_id');
  if (!source || !provider || !model_id) return { error: 'source, provider, model_id sind erforderlich' };
  if (!TIERS.includes(body.tier as Tier)) return { error: 'tier muss sonnet oder haiku sein' };
  const priority = Number(body.priority);
  if (!Number.isInteger(priority) || priority < 0) return { error: 'priority muss eine nicht-negative Ganzzahl sein' };
  const baseUrlRaw = typeof body.base_url === 'string' ? body.base_url.trim() : '';
  const max_concurrent = body.max_concurrent == null ? 3 : Number(body.max_concurrent);
  if (!Number.isInteger(max_concurrent) || max_concurrent < 1) return { error: 'max_concurrent muss >= 1 sein' };
  return {
    value: {
      source, tier: body.tier as Tier, priority, provider, model_id,
      base_url: baseUrlRaw || null,
      max_concurrent,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    },
  };
}

export const GET: APIRoute = async ({ request }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const [entries, health] = await Promise.all([listProviders(), listHealth()]);
    return json({ entries, health });
  } catch (err) {
    console.error('[api/admin/ki/providers] GET error:', err);
    return json({ error: 'fetch_failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const parsed = parseNew(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const id = await createProvider(parsed.value);
    return json({ id }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return json({ error: 'Diese (source, tier, priority)-Kombination existiert bereits.' }, 409);
    }
    console.error('[api/admin/ki/providers] POST error:', err);
    return json({ error: 'create_failed' }, 500);
  }
};
