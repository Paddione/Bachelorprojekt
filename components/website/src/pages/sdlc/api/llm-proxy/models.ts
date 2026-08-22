import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { proxyFetch, classifyProxyError } from '../../../../lib/sdlc/llm-proxy-client';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const res = await proxyFetch('/admin/models');
    if (!res.ok) {
      const err = classifyProxyError(new Error(`HTTP ${res.status}`), res.status);
      return json({ error: err }, res.status);
    }
    const data = await res.json();
    return json(data);
  } catch (err) {
    const classified = classifyProxyError(err);
    locals?.requestLogger?.error({ err }, '[api/sdlc/llm-proxy/models] GET error');
    return json({ error: classified }, 503);
  }
};
