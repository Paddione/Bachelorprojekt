import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createPoll, getActivePoll } from '../../../../lib/poll-db';
import { listActiveCallRooms, ensureBrettBotEnabledForRoom } from '../../../../lib/nextcloud-talk-db';
import { postBotReply } from '../../../../lib/brett-bot';

const SITE_URL = process.env.SITE_URL || 'https://web.localhost';
const BOT_SECRET = process.env.BRETT_BOT_SECRET || '';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const existing = await getActivePoll();
  if (existing) {
    return new Response(
      JSON.stringify({ error: 'poll_already_active', id: existing.id }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }
  const { question, kind, options } = (body ?? {}) as Record<string, unknown>;

  if (!question || typeof question !== 'string' || question.trim().length < 2) {
    return new Response(JSON.stringify({ error: 'question required (min 2 chars)' }), { status: 400 });
  }
  if (kind !== 'multiple_choice' && kind !== 'text') {
    return new Response(JSON.stringify({ error: 'kind must be multiple_choice or text' }), { status: 400 });
  }
  if (kind === 'multiple_choice' && (!Array.isArray(options) || options.length < 2)) {
    return new Response(JSON.stringify({ error: 'multiple_choice requires >= 2 options' }), { status: 400 });
  }

  const rooms = await listActiveCallRooms();
  const poll = await createPoll(
    question.trim(),
    kind,
    kind === 'text' ? null : (options as string[]),
    rooms.map(r => r.token),
  );

  const pollUrl = `${SITE_URL}/poll/${poll.id}`;
  const broadcastResults = await Promise.all(
    rooms.map(async r => {
      await ensureBrettBotEnabledForRoom(r.token);
      const ok = await postBotReply(r.token, `\u{1F4CA} Umfrage: ${pollUrl}`, BOT_SECRET);
      return { token: r.token, displayName: r.displayName, ok };
    }),
  );

  const sent = broadcastResults.filter(r => r.ok).length;
  return new Response(
    JSON.stringify({ poll, broadcastResults, sent, total: rooms.length }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
};
