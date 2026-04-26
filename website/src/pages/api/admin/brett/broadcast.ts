// Admin-only: list Talk rooms with an active call, and broadcast the
// Systemisches-Brett link to all of them. Powers the "Brett für alle starten"
// button on /admin/meetings.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listActiveCallRooms, sendChatMessage } from '../../../../lib/talk';

const BRETT_DOMAIN = process.env.BRETT_DOMAIN || 'brett.localhost';

function brettUrlFor(roomToken: string): string {
  return `https://${BRETT_DOMAIN}/?room=${encodeURIComponent(roomToken)}`;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const rooms = await listActiveCallRooms();
  return new Response(JSON.stringify({ rooms }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const rooms = await listActiveCallRooms();
  const results = await Promise.all(
    rooms.map(async (r) => {
      const ok = await sendChatMessage(r.token, `🎯 Systemisches Brett: ${brettUrlFor(r.token)}`);
      return { token: r.token, displayName: r.displayName, ok };
    })
  );

  const sent = results.filter((r) => r.ok).length;
  return new Response(
    JSON.stringify({ total: rooms.length, sent, failed: rooms.length - sent, results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
