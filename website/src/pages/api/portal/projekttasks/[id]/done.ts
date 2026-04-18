import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { togglePortalTaskDone } from '../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const taskId = params.id;
  if (!taskId) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const result = await togglePortalTaskDone(taskId, session.sub);
  if (!result.ok) return new Response(JSON.stringify({ error: 'Forbidden or not found' }), { status: 403 });

  const referer = request.headers.get('referer') ?? '/portal?section=projekte';
  return new Response(null, { status: 303, headers: { Location: referer } });
};
