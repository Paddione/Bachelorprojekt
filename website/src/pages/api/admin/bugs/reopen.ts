import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { reopenBugTicket } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let ticketId = '';
  let reason = '';
  try {
    const json = await request.json();
    ticketId = String(json?.ticketId ?? '').trim();
    reason = String(json?.reason ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
  if (!ticketId) {
    return new Response(JSON.stringify({ error: 'ticketId is required' }), { status: 400 });
  }

  try {
    await reopenBugTicket(ticketId, session.preferred_username, reason || undefined);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[bugs/reopen] DB error:', err);
    const status = err.message?.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: err.message ?? 'DB error' }), { status });
  }
};
