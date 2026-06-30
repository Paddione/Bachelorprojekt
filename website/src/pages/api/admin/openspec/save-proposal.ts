import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { isValidSlug, writeProposal } from '../../../../lib/openspec/proposal';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  let slug: string;
  let content: string;
  try {
    const body = await request.json();
    slug = body?.slug;
    content = body?.content;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!isValidSlug(slug) || typeof content !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid parameters' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await writeProposal(slug, content);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'save failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
