import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { mintArenaToken } from '../../../lib/arena-token';

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const result = mintArenaToken(user.access_token);
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
