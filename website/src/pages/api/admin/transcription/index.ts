// Admin: list active Talk rooms + transcription session state, and start/stop
// transcription for a specific room. Powers the "Transkription" modal on
// /admin/meetings. Calls the internal talk-transcriber admin endpoints
// (cluster-internal only, no HMAC required).
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listActiveCallRooms } from '../../../../lib/nextcloud-talk-db';

const TRANSCRIBER_URL =
  process.env.TRANSCRIBER_URL ||
  'http://talk-transcriber.workspace.svc.cluster.local:8000';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const rooms = await listActiveCallRooms();

  let activeSessions: string[] = [];
  try {
    const res = await fetch(`${TRANSCRIBER_URL}/admin/sessions`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as { sessions: string[] };
      activeSessions = data.sessions ?? [];
    }
  } catch {
    // transcriber may not be running; return empty sessions silently
  }

  return new Response(JSON.stringify({ rooms, activeSessions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json() as { token?: string; action?: 'start' | 'stop' };
  const { token, action } = body;

  if (!token || (action !== 'start' && action !== 'stop')) {
    return new Response(JSON.stringify({ error: 'token and action (start|stop) required' }), { status: 400 });
  }

  const endpoint = action === 'start' ? '/admin/start' : '/admin/stop';
  try {
    const res = await fetch(`${TRANSCRIBER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Transcriber nicht erreichbar' }), { status: 503 });
  }
};
