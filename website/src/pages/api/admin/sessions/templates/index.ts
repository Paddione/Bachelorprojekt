import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listTemplates, cloneTemplate } from '../../../../../lib/sessions/templates';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  try {
    const templates = await listTemplates(session!.sub);
    return json({ templates }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/templates] GET error:');
    return json({ error: 'read_failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }
  const templateId = String(body.templateId ?? '').trim();
  if (!templateId) return json({ error: 'templateId_required' }, 400);
  try {
    const template = await cloneTemplate(templateId, session!.sub, {
      title: body.title as string | undefined,
      slug: body.slug as string | undefined,
      body_markdown: body.body_markdown as string | undefined,
    });
    return json({ template }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/templates] POST error:');
    return json({ error: (err as Error).message }, 400);
  }
};
