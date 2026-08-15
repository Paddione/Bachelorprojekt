import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getProject, updateProject } from '../../../../../lib/coaching-project-db';
import { listSessions } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id as string;
  const brand = process.env.BRAND || 'mentolder';
  const project = await getProject(pool, id);
  if (!project) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  const sessionsResult = await listSessions(pool, brand, { pageSize: 100 });
  const sessions = sessionsResult.sessions.filter(s => s.projectId === id);

  return new Response(JSON.stringify({ project, sessions }), { headers: { 'content-type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id as string;
  let body: { kiContext?: string | null; notes?: string | null; displayAlias?: string | null };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const updated = await updateProject(pool, id, {
    ...(body.kiContext !== undefined ? { kiContext: body.kiContext } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.displayAlias !== undefined ? { displayAlias: body.displayAlias } : {}),
  });
  if (!updated) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  return new Response(JSON.stringify({ project: updated }), { headers: { 'content-type': 'application/json' } });
};
