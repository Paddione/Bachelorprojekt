import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { mintArenaToken } from '../../../lib/arena-token';

const UPSTREAM = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const tokenResult = await mintArenaToken(user.access_token);
  if ('kind' in tokenResult) {
    return new Response(JSON.stringify({ error: tokenResult.kind, status: tokenResult.status }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }

  const upstream = await fetch(`${UPSTREAM}/lobby/open`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenResult.token}` },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};
