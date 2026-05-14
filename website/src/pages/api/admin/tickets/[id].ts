// website/src/pages/api/admin/tickets/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getTicketDetail, getTicketTimeline, patchAdminTicket } from '../../../../lib/tickets/admin';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const GET: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const [detail, timeline] = await Promise.all([
    getTicketDetail(BRAND(), id),
    url.searchParams.get('timeline') === '1' ? getTicketTimeline(BRAND(), id) : Promise.resolve(null),
  ]);
  if (!detail) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  return new Response(JSON.stringify({ ticket: detail, timeline }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  // Reject status/resolution — they go through /transition.
  if ('status' in body || 'resolution' in body) {
    return new Response(JSON.stringify({
      error: 'use /api/admin/tickets/:id/transition for status changes',
    }), { status: 400 });
  }

  // Whitelist allowed fields.
  const allowed = ['title','description','notes','url','priority','severity','component',
                   'attentionMode', 'thesisTag','parentId','customerId','assigneeId','reporterEmail',
                   'startDate','dueDate','estimateMinutes'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = (body as Record<string, unknown>)[k];

  try {
    await patchAdminTicket({
      brand: BRAND(),
      id,
      ...patch,
      actor: { label: session.preferred_username },
    } as Parameters<typeof patchAdminTicket>[0]);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'patch failed';
    const status = msg.includes('not found') ? 404 : 400;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
