import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { createQaReview } from '../../../lib/qa-dal';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { ticket_id, criteria, notes, verdict, re_entry_phase } = body ?? {};

  if (!ticket_id || !Array.isArray(criteria) || !verdict)
    return new Response(JSON.stringify({ error: 'ticket_id, criteria, verdict required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!['approved', 'rejected'].includes(verdict))
    return new Response(JSON.stringify({ error: 'verdict must be approved or rejected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (verdict === 'rejected' && !notes?.trim())
    return new Response(JSON.stringify({ error: 'notes required when rejecting' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (verdict === 'rejected' && !re_entry_phase)
    return new Response(JSON.stringify({ error: 're_entry_phase required when rejecting' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await createQaReview({ ticketId: ticket_id, criteria, notes, verdict, re_entry_phase });
    return new Response(JSON.stringify({ ok: true }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
