import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { deleteCalendarEvent } from '../../../../../lib/caldav';

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const uid = params.uid;
  if (!uid) return new Response(JSON.stringify({ error: 'Missing uid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const ok = await deleteCalendarEvent(uid);
  if (!ok) return new Response(JSON.stringify({ error: 'Löschen fehlgeschlagen. Termin wurde möglicherweise extern erstellt.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
