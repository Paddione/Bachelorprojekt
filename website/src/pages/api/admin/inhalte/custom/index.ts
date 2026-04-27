import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listCustomSections, createCustomSection } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!isAdmin(session)) return new Response('Forbidden', { status: 403 });
  try {
    const sections = await listCustomSections();
    return new Response(JSON.stringify(sections), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[inhalte/custom GET] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!isAdmin(session)) return new Response('Forbidden', { status: 403 });
  let body: { slug: string; title: string; fields: unknown[] };
  try {
    body = await request.json() as { slug: string; title: string; fields: unknown[] };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!body.slug?.trim() || !body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'slug and title required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug.trim())) {
    return new Response(JSON.stringify({ error: 'slug must be lowercase alphanumeric with hyphens' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const section = await createCustomSection({
      slug: body.slug.trim(),
      title: body.title.trim(),
      fields: (body.fields ?? []) as Parameters<typeof createCustomSection>[0]['fields'],
    });
    return new Response(JSON.stringify(section), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return new Response(JSON.stringify({ error: 'slug already exists' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    console.error('[inhalte/custom POST] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
