import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getSiteSetting, setSiteSetting } from '../../../../lib/website-db';
import { EMBED_PRIMARY_KEY, EMBED_FALLBACK_KEY } from '../../../../lib/ki-config-db';

export const prerender = false;

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const PRIMARY = ['bge-m3', 'voyage'] as const;
const FALLBACK = ['voyage', null] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const [primary, fallback] = await Promise.all([
      getSiteSetting(BRAND, EMBED_PRIMARY_KEY),
      getSiteSetting(BRAND, EMBED_FALLBACK_KEY),
    ]);
    const rerankEnabled = process.env.LLM_RERANK_ENABLED === 'true';
    return json({ primary: primary ?? 'bge-m3', fallback: fallback || null, rerankEnabled });
  } catch (err) {
    console.error('[api/admin/ki/embeddings] GET error:', err);
    return json({ error: 'fetch_failed' }, 500);
  }
};

export const PUT: APIRoute = async ({ request }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const primary = body.primary;
  const fallback = body.fallback ?? null;
  if (!PRIMARY.includes(primary as (typeof PRIMARY)[number])) {
    return json({ error: 'primary muss bge-m3 oder voyage sein' }, 400);
  }
  if (!FALLBACK.includes(fallback as (typeof FALLBACK)[number])) {
    return json({ error: 'fallback muss voyage oder null sein' }, 400);
  }
  try {
    await setSiteSetting(BRAND, EMBED_PRIMARY_KEY, String(primary));
    await setSiteSetting(BRAND, EMBED_FALLBACK_KEY, fallback ? String(fallback) : '');
    return json({ ok: true });
  } catch (err) {
    console.error('[api/admin/ki/embeddings] PUT error:', err);
    return json({ error: 'update_failed' }, 500);
  }
};
