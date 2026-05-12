import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { mintArenaToken } from '../../../lib/arena-token';

const UPSTREAM_BASE = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

export const GET: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const { token } = mintArenaToken(user.access_token);

  const upstream = await fetch(`${UPSTREAM_BASE}/match`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!upstream?.ok) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(await upstream.text(), { status: 200, headers: { 'content-type': 'application/json' } });
};
