// Admin-only: list Talk rooms with an active call, and broadcast the
// Systemisches-Brett link to all of them. Powers the "Brett für alle starten"
// button on /admin/meetings.
//
// Discovery uses the Nextcloud Talk DB (oc_talk_rooms.active_since) because
// Talk's OCS /room endpoint is user-scoped and misses calls in rooms where
// the configured NC admin isn't a participant.
//
// Posting uses the bot reply endpoint (HMAC-signed via BRETT_BOT_SECRET).
// The brett bot is installed globally (talk:bot:install without --no-setup),
// so it can post to any conversation regardless of admin participation.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  listActiveCallRooms,
  ensureBrettBotEnabledForRoom,
} from '../../../../lib/nextcloud-talk-db';
import { postBotReply } from '../../../../lib/brett-bot';

const BRETT_DOMAIN = process.env.BRETT_DOMAIN || 'brett.localhost';
const BOT_SECRET = process.env.BRETT_BOT_SECRET || '';

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
  if (!BOT_SECRET) {
    return new Response(JSON.stringify({ error: 'BRETT_BOT_SECRET not configured' }), { status: 500 });
  }

  const rooms = await listActiveCallRooms();
  const results = await Promise.all(
    rooms.map(async (r) => {
      // Talk's bot-reply endpoint returns 401 unless the bot is explicitly
      // enabled for the conversation. talk:bot:install does not enable it
      // for every room automatically, so make sure the row exists first.
      await ensureBrettBotEnabledForRoom(r.token);
      const ok = await postBotReply(
        r.token,
        `🎯 Systemisches Brett: ${brettUrlFor(r.token)}`,
        BOT_SECRET
      );
      return { token: r.token, displayName: r.displayName, ok };
    })
  );

  const sent = results.filter((r) => r.ok).length;
  return new Response(
    JSON.stringify({ total: rooms.length, sent, failed: rooms.length - sent, results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
