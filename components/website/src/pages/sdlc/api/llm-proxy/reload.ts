import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

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

export const POST: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(`${PROXY_URL}/admin/reload`, { method: 'POST', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json({ ok: true });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    locals.requestLogger.warn({ err }, '[api/admin/llm-proxy/reload] proxy offline');
    return json({ proxy: 'offline', reloaded: false });
  }
};
