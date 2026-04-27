import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCustomSection, deleteCustomSection } from '../../../../../lib/website-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const slug = params.slug!;
  const body = await request.json() as {
    title?: string;
    fields?: unknown[];
    content?: Record<string, string>;
    sort_order?: number;
  };
  const updated = await updateCustomSection(slug, {
    title: body.title,
    fields: body.fields as Parameters<typeof updateCustomSection>[1]['fields'],
    content: body.content,
    sort_order: body.sort_order,
  });
  if (!updated) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  await deleteCustomSection(params.slug!);
  return new Response(null, { status: 204 });
};
