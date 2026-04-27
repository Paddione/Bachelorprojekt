import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCustomSection, deleteCustomSection } from '../../../../../lib/website-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const slug = params.slug!;
  let body: { title?: string; fields?: unknown[]; content?: Record<string, string>; sort_order?: number };
  try {
    body = await request.json() as {
      title?: string;
      fields?: unknown[];
      content?: Record<string, string>;
      sort_order?: number;
    };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const updated = await updateCustomSection(slug, {
      title: body.title,
      fields: body.fields as Parameters<typeof updateCustomSection>[1]['fields'],
      content: body.content,
      sort_order: body.sort_order,
    });
    if (!updated) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[inhalte/custom PUT] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!isAdmin(session)) return new Response('Forbidden', { status: 403 });
  try {
    await deleteCustomSection(params.slug!);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[inhalte/custom DELETE] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
