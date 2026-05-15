import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

const UPSTREAM = process.env.ARENA_WS_URL ?? 'http://localhost:8090';
const UPSTREAM_HTTP = UPSTREAM.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const GET: APIRoute = async (ctx) => {
  const session = await getSession(ctx.request.headers.get('cookie'));
  if (!session) return new Response('unauthorised', { status: 401 });

  try {
    const res = await fetch(`${UPSTREAM_HTTP}/lobby/active`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
       return new Response(JSON.stringify({ active: false, error: 'upstream-failed' }), { status: res.status });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ active: false, error: e.message }), { status: 500 });
  }
};
