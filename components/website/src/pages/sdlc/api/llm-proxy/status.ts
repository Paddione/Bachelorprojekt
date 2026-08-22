import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listBackends } from '../../../../lib/sdlc/llm-proxy-db';
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
    const res = await proxyFetch('/admin/state');
    if (!res.ok) {
      const errClassification = classifyProxyError(new Error(`HTTP ${res.status}`), res.status);
      locals?.requestLogger?.warn({ status: res.status }, '[api/admin/llm-proxy/status] proxy error status, DB fallback');
      const backends = await listBackends();
      return json({
        proxy: errClassification.kind,
        address: errClassification.address,
        message: errClassification.message,
        backends,
      });
    }
    const data = (await res.json()) as Record<string, unknown>;
    return json({ proxy: 'online', ...data });
  } catch (err) {
    const errClassification = classifyProxyError(err);
    locals?.requestLogger?.warn({ err }, '[api/admin/llm-proxy/status] proxy unreachable, DB fallback');
    const backends = await listBackends();
    return json({
      proxy: errClassification.kind,
      address: errClassification.address,
      message: errClassification.message,
      backends,
    });
  }
};
