import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { lockPoll, getResults, buildResultsBotMessage } from '../../../../../lib/poll-db';
import { postBotReply } from '../../../../../lib/brett-bot';

const SITE_URL = process.env.SITE_URL || 'https://web.localhost';
const BOT_SECRET = process.env.BRETT_BOT_SECRET || '';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const poll = await lockPoll(params.id!);
  if (!poll) {
    return new Response(
      JSON.stringify({ error: 'not found or already locked' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const results = await getResults(poll.id);
  if (!results) {
    return new Response(JSON.stringify({ error: 'results unavailable' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const resultsUrl = `${SITE_URL}/poll/${poll.id}/results`;
  const message = buildResultsBotMessage(results, resultsUrl);

  const broadcastResults = await Promise.all(
    poll.room_tokens.map(async token => {
      const ok = await postBotReply(token, message, BOT_SECRET);
      return { token, ok };
    }),
  );

  const sent = broadcastResults.filter(r => r.ok).length;
  return new Response(
    JSON.stringify({ poll, results, sent, total: poll.room_tokens.length, broadcastResults }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
