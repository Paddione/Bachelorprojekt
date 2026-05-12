import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { mintArenaToken } from '../../../lib/arena-token';

const UPSTREAM = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const { token } = mintArenaToken(user.access_token);

  const upstream = await fetch(`${UPSTREAM}/lobby/solo`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};
