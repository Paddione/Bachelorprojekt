import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { mintArenaToken } from '../../../lib/arena-token';

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const result = await mintArenaToken(user.access_token);
  if ('kind' in result) {
    return new Response(JSON.stringify({ error: result.kind, status: result.status }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
