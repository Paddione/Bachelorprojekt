import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { deleteTemplate } from '../../../../../lib/sessions/templates';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);

  const id = params.id;
  if (!id) return json({ error: 'id_required' }, 400);

  try {
    await deleteTemplate(id, session.sub);
    return json({ ok: true }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/templates/[id]] DELETE error:');
    return json({ error: (err as Error).message }, 400);
  }
};
