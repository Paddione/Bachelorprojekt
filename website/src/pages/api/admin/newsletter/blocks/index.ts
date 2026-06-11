import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  listContentBlocks,
  createContentBlock,
  type NewsletterBlockType,
} from '../../../../../lib/newsletter-blocks-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const blocks = await listContentBlocks();
  return new Response(JSON.stringify(blocks), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let body: { title?: string; block_type?: string; html_body?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const title = String(body.title ?? '').trim();
  const html_body = String(body.html_body ?? '').trim();
  const block_type = String(body.block_type ?? 'text').trim() as NewsletterBlockType;
  if (!title || !html_body) {
    return new Response(
      JSON.stringify({ error: 'Titel und Inhalt sind erforderlich' }),
      { status: 400 },
    );
  }
  const VALID_TYPES: NewsletterBlockType[] = ['header', 'angebot', 'cta', 'text', 'footer'];
  if (!VALID_TYPES.includes(block_type)) {
    return new Response(
      JSON.stringify({ error: `Ungültiger block_type: ${block_type}` }),
      { status: 400 },
    );
  }
  const block = await createContentBlock({ title, block_type, html_body });
  return new Response(JSON.stringify(block), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
