import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listDocumentTemplates, createDocumentTemplate } from '../../../../../lib/documents-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const templates = await listDocumentTemplates();
  return new Response(JSON.stringify(templates), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { title?: string; html_body?: string };
  if (!body.title?.trim() || !body.html_body?.trim()) {
    return new Response(JSON.stringify({ error: 'Titel und Inhalt sind erforderlich.' }), { status: 400 });
  }
  const template = await createDocumentTemplate({ title: body.title.trim(), html_body: body.html_body.trim() });
  return new Response(JSON.stringify(template), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
