import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { appendBugTicketComment } from '../../../../../lib/website-db';

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = params.id?.toString().trim() ?? '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing ticket id' }), { status: 400 });
  }

  let body = '';
  try {
    const json = await request.json();
    body = String(json?.body ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
  if (!body) {
    return new Response(JSON.stringify({ error: 'Comment body is required' }), { status: 400 });
  }
  if (body.length > 8000) {
    return new Response(JSON.stringify({ error: 'Comment too long (max 8000 chars)' }), { status: 400 });
  }

  try {
    const comment = await appendBugTicketComment({
      ticketId: id,
      author: session.preferred_username,
      body,
      kind: 'comment',
    });
    return new Response(JSON.stringify(comment), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[bugs/[id]/comments] DB error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'DB error' }), { status: 500 });
  }
};
