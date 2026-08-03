import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listBackends } from '../../../../lib/llm-proxy-db';

export const prerender = false;

const PROXY_URL = process.env.LLM_PROXY_URL ?? 'http://127.0.0.1:18235';

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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(`${PROXY_URL}/admin/state`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return json({ proxy: 'ok', ...data });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Offline-tolerant: the cluster website cannot reach the host-local proxy.
    // Fall back to the DB registry so the GUI can still render backends.
    locals?.requestLogger?.warn({ err }, '[api/admin/llm-proxy/status] proxy offline, DB fallback');
    const backends = await listBackends();
    return json({ proxy: 'offline', backends });
  }
};
