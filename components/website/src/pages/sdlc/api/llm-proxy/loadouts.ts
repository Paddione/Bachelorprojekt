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
    const res = await proxyFetch('/admin/loadouts');
    if (!res.ok) {
      const err = classifyProxyError(new Error(`HTTP ${res.status}`), res.status);
      return json({ error: err }, res.status);
    }
    const data = await res.json();
    return json(data);
  } catch (err) {
    const classified = classifyProxyError(err);
    locals?.requestLogger?.error({ err }, '[api/sdlc/llm-proxy/loadouts] GET error');
    return json({ error: classified }, 503);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    const res = await proxyFetch('/admin/loadouts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      return json({ error: 'conflict', message: 'Loadouts wurden zwischenzeitlich geändert' }, 409);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
      return json(data, res.status);
    }
    const data = await res.json();
    return json(data);
  } catch (err) {
    const classified = classifyProxyError(err);
    locals?.requestLogger?.error({ err }, '[api/sdlc/llm-proxy/loadouts] PUT error');
    return json({ error: classified }, 503);
  }
};
