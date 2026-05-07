import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveReferenzen } from '../../../../lib/website-db';
import type { ReferenzenConfig, ReferenzItem, ReferenzenType } from '../../../../lib/website-db';

function sanitizeConfig(input: unknown): ReferenzenConfig {
  const obj = (input ?? {}) as Partial<ReferenzenConfig> & { items?: unknown; types?: unknown };
  const types: ReferenzenType[] = Array.isArray(obj.types)
    ? (obj.types as ReferenzenType[])
        .filter((t) => t && typeof t.id === 'string' && t.id.trim() && typeof t.label === 'string')
        .map((t) => ({ id: t.id.trim(), label: t.label.trim() }))
    : [];
  const validTypeIds = new Set(types.map((t) => t.id));
  const items: ReferenzItem[] = Array.isArray(obj.items)
    ? (obj.items as ReferenzItem[])
        .filter((it) => it && typeof it.name === 'string' && it.name.trim())
        .map((it) => ({
          id: typeof it.id === 'string' && it.id ? it.id : crypto.randomUUID(),
          name: it.name.trim(),
          url: it.url?.trim() || undefined,
          logoUrl: it.logoUrl?.trim() || undefined,
          description: it.description?.trim() || undefined,
          type: it.type && validTypeIds.has(it.type) ? it.type : undefined,
        }))
    : [];
  return {
    heading: typeof obj.heading === 'string' ? obj.heading.trim() || undefined : undefined,
    subheading: typeof obj.subheading === 'string' ? obj.subheading.trim() || undefined : undefined,
    types,
    items,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const config = sanitizeConfig(raw);
  try {
    await saveReferenzen(BRAND, config);
  } catch (err) {
    console.error('[referenzen/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
