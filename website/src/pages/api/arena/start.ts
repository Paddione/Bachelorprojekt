import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

const UPSTREAM = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const POST: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  // Mint an arena-scoped access token (re-uses /api/arena/token logic via internal fetch).
  const tokenRes = await fetch(`${ctx.url.origin}/api/arena/token`, {
    method: 'POST',
    headers: { cookie: ctx.request.headers.get('cookie') ?? '' },
  });
  if (!tokenRes.ok) return new Response('token-mint-failed', { status: 502 });
  const { token } = await tokenRes.json() as { token: string };

  const upstream = await fetch(`${UPSTREAM}/lobby/open`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};