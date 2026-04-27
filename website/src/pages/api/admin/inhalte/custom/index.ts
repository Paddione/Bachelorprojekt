import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listCustomSections, createCustomSection } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const sections = await listCustomSections();
  return new Response(JSON.stringify(sections), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const body = await request.json() as { slug: string; title: string; fields: unknown[] };
  if (!body.slug?.trim() || !body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'slug and title required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const section = await createCustomSection({
    slug: body.slug.trim(),
    title: body.title.trim(),
    fields: (body.fields ?? []) as Parameters<typeof createCustomSection>[0]['fields'],
  });
  return new Response(JSON.stringify(section), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
