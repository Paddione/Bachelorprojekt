import type { APIRoute } from 'astro';
import { getPoll } from '../../../lib/poll-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ params }) => {
  if (!params.id || !UUID_RE.test(params.id)) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const poll = await getPoll(params.id);
  if (!poll) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  if (poll.status === 'locked') {
    return new Response(JSON.stringify({ error: 'locked' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(
    JSON.stringify({ id: poll.id, question: poll.question, kind: poll.kind, options: poll.options }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
