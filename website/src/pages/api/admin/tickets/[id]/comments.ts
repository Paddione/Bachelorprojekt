// website/src/pages/api/admin/tickets/[id]/comments.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addComment } from '../../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const text = String(body.body ?? '').trim();
  if (!text) return new Response(JSON.stringify({ error: 'body is required' }), { status: 400 });
  if (text.length > 4000) {
    return new Response(JSON.stringify({ error: 'body too long (max 4000)' }), { status: 400 });
  }

  try {
    const r = await addComment({
      brand: BRAND(),
      ticketId: id,
      body: text,
      visibility: body.visibility === 'public' ? 'public' : 'internal',
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, ...r }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'comment failed';
    const status = msg.includes('not found') ? 404 : 400;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
