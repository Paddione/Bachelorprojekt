// website/src/pages/api/admin/tickets/[id]/links.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addLink, removeLink, type LinkKind } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const VALID_KINDS: ReadonlySet<LinkKind> = new Set(
  ['blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by']);

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const fromId = String(params.id ?? '');
  if (!fromId) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const kind = body.kind as LinkKind;
  const toId = String(body.toId ?? '').trim();
  if (!VALID_KINDS.has(kind)) return new Response(JSON.stringify({ error: 'invalid kind' }), { status: 400 });
  if (!toId) return new Response(JSON.stringify({ error: 'toId required' }), { status: 400 });

  try {
    const r = await addLink({
      brand: BRAND(),
      fromId, toId, kind,
      prNumber: typeof body.prNumber === 'number' ? body.prNumber : undefined,
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, id: r.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'link failed' }),
      { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const fromId = String(params.id ?? '');
  const linkId = Number(url.searchParams.get('linkId') ?? '0');
  if (!fromId || !Number.isInteger(linkId) || linkId <= 0) {
    return new Response(JSON.stringify({ error: 'fromId+linkId required' }), { status: 400 });
  }
  try {
    await removeLink(BRAND(), fromId, linkId);
    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unlink failed' }),
      { status: 400 });
  }
};
