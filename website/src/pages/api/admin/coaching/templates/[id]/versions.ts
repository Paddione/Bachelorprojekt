import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getTemplate, listTemplateVersions } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const t = await getTemplate(pool, params.id as string);
  if (!t) return new Response('Not Found', { status: 404 });
  const versions = await listTemplateVersions(pool, t.snippetId, t.targetSurface);
  return new Response(JSON.stringify(versions), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
