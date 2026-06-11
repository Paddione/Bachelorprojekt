import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  updateContentBlock,
  deleteContentBlock,
  type NewsletterBlockType,
} from '../../../../../lib/newsletter-blocks-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  let body: { title?: string; block_type?: string; html_body?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const VALID_TYPES: NewsletterBlockType[] = ['header', 'angebot', 'cta', 'text', 'footer'];
  const block_type =
    body.block_type !== undefined
      ? (String(body.block_type) as NewsletterBlockType)
      : undefined;
  if (block_type !== undefined && !VALID_TYPES.includes(block_type)) {
    return new Response(
      JSON.stringify({ error: `Ungültiger block_type: ${block_type}` }),
      { status: 400 },
    );
  }
  const updated = await updateContentBlock(id, {
    title: body.title !== undefined ? String(body.title).trim() : undefined,
    block_type,
    html_body: body.html_body !== undefined ? String(body.html_body).trim() : undefined,
  });
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Block nicht gefunden' }), { status: 404 });
  }
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  await deleteContentBlock(id);
  return new Response(null, { status: 204 });
};
