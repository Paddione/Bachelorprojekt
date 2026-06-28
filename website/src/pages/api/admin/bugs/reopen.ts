import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { reopenBugTicket } from '../../../../lib/website-db';
import { pool } from '../../../../lib/website-db';
import { recordAudit, clientIpFromRequest } from '../../../../lib/audit-log';

export const POST: APIRoute = async ({ request , locals }) => {
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
    recordAudit(pool, { actor_id: session.sub, actor_email: session.email, action: 'bug.reopen', target_type: 'bug', target_id: ticketId, ip: clientIpFromRequest(request) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    locals.requestLogger.error({ err }, '[bugs/reopen] DB error:');
    const msg = err instanceof Error ? (err.message ?? 'DB error') : String(err);
    const status = msg.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
