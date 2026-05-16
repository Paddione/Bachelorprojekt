import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateKiProvider } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Ungültige ID' }), { status: 400, headers: { 'content-type': 'application/json' } });

  let body: { modelName?: string | null; displayName?: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if (typeof body.displayName !== 'string' || body.displayName.trim() === '') {
    return new Response(JSON.stringify({ error: 'displayName darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const provider = await updateKiProvider(pool, id, {
    modelName: body.modelName ?? null,
    displayName: body.displayName.trim(),
  });
  return new Response(JSON.stringify({ provider }), { headers: { 'content-type': 'application/json' } });
};
