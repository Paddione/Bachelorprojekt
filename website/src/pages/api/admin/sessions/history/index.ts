import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listArchivedSessions } from '../../../../../lib/sessions/archive';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const offsetParam = url.searchParams.get('offset');
  const limitParam = url.searchParams.get('limit');
  const type = url.searchParams.get('type') || undefined;

  let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
  let limit = limitParam ? parseInt(limitParam, 10) : 50;

  if (isNaN(offset) || offset < 0) offset = 0;
  if (isNaN(limit) || limit <= 0) limit = 50;
  if (limit > 50) limit = 50;

  try {
    const viewer = session.preferred_username || 'unknown';
    const isUserAdmin = isAdmin(session);

    const result = await listArchivedSessions({
      viewer,
      isAdmin: isUserAdmin,
      offset,
      limit,
      type,
    });

    return json(result, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/history] GET error:');
    return json({ error: 'failed_to_list_history' }, 500);
  }
};
