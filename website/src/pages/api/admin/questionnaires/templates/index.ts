import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listQTemplates, createQTemplate } from '../../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const templates = await listQTemplates();
  return new Response(JSON.stringify(templates), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { title?: string; description?: string; instructions?: string };
  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'Titel erforderlich.' }), { status: 400 });
  }
  const tpl = await createQTemplate({
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    instructions: body.instructions?.trim() ?? '',
  });
  return new Response(JSON.stringify(tpl), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
