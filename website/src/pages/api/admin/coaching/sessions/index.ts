import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSession, listSessions } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const sessions = await listSessions(pool, brand);
  return new Response(JSON.stringify({ sessions }), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: { title: string; clientId?: string | null; mode?: 'live' | 'prep' };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'title required' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const created = await createSession(pool, {
    brand, title: body.title, createdBy: session.preferred_username,
    clientId: body.clientId ?? null, mode: body.mode ?? 'live',
  });
  return new Response(JSON.stringify({ session: created }), { status: 201, headers: { 'content-type': 'application/json' } });
};
