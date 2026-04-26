import type { APIRoute } from 'astro';
import { getResults } from '../../../../lib/poll-db';

export const GET: APIRoute = async ({ params }) => {
  const results = await getResults(params.id!);
  if (!results) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  if (results.poll.status !== 'locked') {
    return new Response(JSON.stringify({ error: 'results not available yet' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
