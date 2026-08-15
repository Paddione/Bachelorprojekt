import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { createQaReview } from '../../../lib/qa-dal';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const b = body as { ticket_id?: unknown; criteria?: unknown; notes?: unknown; verdict?: unknown; re_entry_phase?: unknown } | null;
  const ticket_id = b?.ticket_id;
  const criteria = b?.criteria;
  const notes = b?.notes;
  const verdict = b?.verdict;
  const re_entry_phase = b?.re_entry_phase;

  if (!ticket_id || !Array.isArray(criteria) || !verdict)
    return new Response(JSON.stringify({ error: 'ticket_id, criteria, verdict required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (typeof verdict !== 'string' || !['approved', 'rejected'].includes(verdict))
    return new Response(JSON.stringify({ error: 'verdict must be approved or rejected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (verdict === 'rejected' && (!notes || typeof notes !== 'string' || !notes.trim()))
    return new Response(JSON.stringify({ error: 'notes required when rejecting' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (verdict === 'rejected' && !re_entry_phase)
    return new Response(JSON.stringify({ error: 're_entry_phase required when rejecting' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await createQaReview({ ticketId: ticket_id as string, criteria: criteria as { key: string; passed: boolean }[], notes: notes as string | undefined, verdict: verdict as 'approved' | 'rejected', re_entry_phase: re_entry_phase as 'scout' | 'implement' | 'verify' | undefined });
    return new Response(JSON.stringify({ ok: true }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
