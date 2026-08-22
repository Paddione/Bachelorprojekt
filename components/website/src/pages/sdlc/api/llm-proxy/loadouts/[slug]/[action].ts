import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { proxyFetch, classifyProxyError } from '../../../../../../lib/sdlc/llm-proxy-client';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const slug = params.slug;
  const action = params.action;

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return json({ error: 'invalid_slug', message: 'Ungültiger Slug' }, 400);
  }

  if (action !== 'start' && action !== 'stop') {
    return json({ error: 'invalid_action', message: "Action muss 'start' oder 'stop' sein" }, 400);
  }

  const pinHeader = request.headers.get('x-loadout-pin');
  const headers: Record<string, string> = {};
  if (pinHeader) {
    headers['x-loadout-pin'] = pinHeader;
  }

  try {
    const res = await proxyFetch(`/admin/loadouts/${slug}/${action}`, {
      method: 'POST',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return json(data, res.status);
  } catch (err) {
    const classified = classifyProxyError(err);
    locals?.requestLogger?.error({ err, slug, action }, '[api/sdlc/llm-proxy/loadouts/action] POST error');
    return json({ error: classified }, 503);
  }
};
