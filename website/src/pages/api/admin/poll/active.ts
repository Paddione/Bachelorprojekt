import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getActivePoll, getResults } from '../../../../lib/poll-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const poll = await getActivePoll();
  if (!poll) {
    return new Response(JSON.stringify({ poll: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = await getResults(poll.id);
  return new Response(JSON.stringify({ poll, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
