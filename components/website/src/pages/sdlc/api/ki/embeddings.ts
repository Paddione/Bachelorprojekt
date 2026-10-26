import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getSiteSetting, setSiteSetting } from '../../../../lib/website-db';
import { EMBED_PRIMARY_KEY, EMBED_FALLBACK_KEY } from '../../../../lib/sdlc/ki-config-db';
import { DENSE_MODEL } from '../../../../../../../scripts/lib/dense-embedding.mjs';

export const prerender = false;

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
// Nur das aktive Gemma-Dense-Modell, kein Fallback-Anbieter mehr.
const PRIMARY = [DENSE_MODEL] as const;
const FALLBACK = [null] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request , locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const [, fallback] = await Promise.all([
      getSiteSetting(BRAND, EMBED_PRIMARY_KEY),
      getSiteSetting(BRAND, EMBED_FALLBACK_KEY),
    ]);
    const rerankEnabled = process.env.LLM_RERANK_ENABLED === 'true';
    // BGE-Settings kontrolliert ersetzen: Anzeige kennt nur Gemma/null.
    void fallback;
    return json({ primary: DENSE_MODEL, fallback: null, rerankEnabled });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/ki/embeddings] GET error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};

export const PUT: APIRoute = async ({ request , locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const primary = body.primary;
  const fallback = body.fallback ?? null;
  if (!PRIMARY.includes(primary as (typeof PRIMARY)[number])) {
    return json({ error: `primary muss ${DENSE_MODEL} sein` }, 400);
  }
  if (!FALLBACK.includes(fallback as (typeof FALLBACK)[number])) {
    return json({ error: 'fallback muss null sein' }, 400);
  }
  try {
    await setSiteSetting(BRAND, EMBED_PRIMARY_KEY, String(primary));
    await setSiteSetting(BRAND, EMBED_FALLBACK_KEY, fallback ? String(fallback) : '');
    return json({ ok: true });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/ki/embeddings] PUT error:');
    return json({ error: 'update_failed' }, 500);
  }
};
