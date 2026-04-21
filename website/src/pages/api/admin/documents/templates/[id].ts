import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from '../../../../../lib/documents-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const template = await getDocumentTemplate(params.id!);
  if (!template) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(template), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { title?: string; html_body?: string };
  const updated = await updateDocumentTemplate(params.id!, body);
  if (!updated) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await deleteDocumentTemplate(params.id!);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
