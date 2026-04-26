import type { APIRoute } from 'astro';
import { getPoll, submitAnswer } from '../../../../lib/poll-db';

export const POST: APIRoute = async ({ request, params }) => {
  const poll = await getPoll(params.id!);
  if (!poll) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  if (poll.status === 'locked') {
    return new Response(JSON.stringify({ error: 'locked' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { answer } = (body ?? {}) as Record<string, unknown>;

  if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'answer required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (answer.trim().length > 1000) {
    return new Response(JSON.stringify({ error: 'answer too long (max 1000 chars)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (poll.kind === 'multiple_choice' && poll.options && !poll.options.includes(answer.trim())) {
    return new Response(JSON.stringify({ error: 'invalid option' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  await submitAnswer(poll.id, answer.trim());
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
