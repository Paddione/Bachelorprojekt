import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCalendarEventStatus } from '../../../../../lib/caldav';

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const uid = params.uid;
  if (!uid) return new Response(JSON.stringify({ error: 'Missing uid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let body: { status?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  if (body.status !== 'CANCELLED' && body.status !== 'CONFIRMED') {
    return new Response(JSON.stringify({ error: 'status must be CANCELLED or CONFIRMED' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const ok = await updateCalendarEventStatus(uid, body.status);
  if (!ok) return new Response(JSON.stringify({ error: 'Status-Update fehlgeschlagen.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
