import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getTemplate, createTemplateDraft } from '../../../../../lib/coaching-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const t = await getTemplate(pool, params.id as string);
  if (!t) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(t), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const existing = await getTemplate(pool, params.id as string);
  if (!existing) return new Response('Not Found', { status: 404 });

  const body = (await request.json()) as { payload?: Record<string, unknown> };
  if (!body.payload) return new Response(JSON.stringify({ error: 'payload required' }), { status: 400 });

  const next = await createTemplateDraft(pool, {
    snippetId: existing.snippetId,
    targetSurface: existing.targetSurface,
    payload: body.payload,
    sourcePointer: existing.sourcePointer,
    createdBy: session.preferred_username,
  });
  return new Response(JSON.stringify(next), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
