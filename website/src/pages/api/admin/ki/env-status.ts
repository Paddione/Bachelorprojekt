import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim());
  const body = {
    ANTHROPIC_API_KEY: has('ANTHROPIC_API_KEY'),
    VOYAGE_API_KEY: has('VOYAGE_API_KEY'),
    LLM_ENABLED: process.env.LLM_ENABLED === 'true',
    LLM_HOST_IP: process.env.LLM_HOST_IP?.trim() || null,
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
