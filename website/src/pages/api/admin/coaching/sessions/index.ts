import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSession, listSessions } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const brand = process.env.BRAND || 'mentolder';
  const q = url.searchParams.get('q') ?? undefined;
  const sort = (url.searchParams.get('sort') ?? undefined) as
    'title' | 'client_name' | 'created_at' | 'status' | undefined;
  const order = (url.searchParams.get('order') ?? undefined) as 'asc' | 'desc' | undefined;
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const archived = url.searchParams.get('archived') === 'true';
  const statusParam = url.searchParams.getAll('status');

  const result = await listSessions(pool, brand, { q, sort, order, page, pageSize, archived, status: statusParam });
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: { title: string; clientId?: string | null; clientName?: string | null; kiConfigId?: number | null; mode?: 'live' | 'prep' };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'title required' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const created = await createSession(pool, {
    brand, title: body.title, createdBy: session.preferred_username,
    clientId: body.clientId ?? null, kiConfigId: body.kiConfigId ?? null, mode: body.mode ?? 'live',
  });
  return new Response(JSON.stringify({ session: created }), { status: 201, headers: { 'content-type': 'application/json' } });
};
