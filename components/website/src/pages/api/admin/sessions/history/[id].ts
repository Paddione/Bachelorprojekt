import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getArchivedContent } from '../../../../../lib/sessions/archive.ts';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }
  // T016251: Admin-only — die Registry/das Meta trägt keinen Owner mehr.
  if (!isAdmin(session)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id } = params;
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return json({ error: 'Invalid ID' }, 400);
  }

  // T016251: Endung am Content (md/html), nicht pauschal markdown.
  const archived = await getArchivedContent(id);
  if (archived === null) {
    return json({ error: 'Not Found' }, 404);
  }

  return new Response(archived.content, {
    status: 200,
    headers: { 'Content-Type': `${archived.contentType}; charset=utf-8` },
  });
};
