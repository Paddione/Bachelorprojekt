import type { APIRoute } from 'astro';
import { getPoll } from '../../../lib/poll-db';

export const GET: APIRoute = async ({ params }) => {
  const poll = await getPoll(params.id!);
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
