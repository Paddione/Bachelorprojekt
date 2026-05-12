import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

const UPSTREAM_BASE = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

export const GET: APIRoute = async (ctx) => {
  const user = await getSession(ctx.request.headers.get('cookie'));
  if (!user) return new Response('unauthorised', { status: 401 });

  const tokenRes = await fetch(`${ctx.url.origin}/api/arena/token`, {
    method: 'POST',
    headers: { cookie: ctx.request.headers.get('cookie') ?? '' },
  }).catch(() => null);

  if (!tokenRes?.ok) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const { token } = await tokenRes.json() as { token: string };

  const upstream = await fetch(`${UPSTREAM_BASE}/match`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!upstream?.ok) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(await upstream.text(), { status: 200, headers: { 'content-type': 'application/json' } });
};
