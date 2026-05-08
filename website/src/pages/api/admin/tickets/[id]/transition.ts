// website/src/pages/api/admin/tickets/[id]/transition.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { transitionTicket } from '../../../../../lib/tickets/transition';
import type { TicketStatus, TicketResolution } from '../../../../../lib/tickets/transition';
import { pool } from '../../../../../lib/website-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }

  const status = body.status as TicketStatus | undefined;
  if (!status) {
    return new Response(JSON.stringify({ error: 'status is required' }), { status: 400 });
  }

  // Brand-guard before calling transitionTicket(): refuse cross-brand transitions.
  const guard = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id = $1`, [id]);
  if (guard.rows.length === 0 || guard.rows[0].brand !== BRAND()) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }

  try {
    const result = await transitionTicket(id, {
      status,
      resolution: body.resolution as TicketResolution | undefined,
      note:  typeof body.note  === 'string' ? body.note  : undefined,
      noteVisibility: body.noteVisibility === 'public' ? 'public' : 'internal',
      actor: { label: session.preferred_username },
    });
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'transition failed';
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }
};
