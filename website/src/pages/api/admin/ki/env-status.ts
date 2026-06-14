import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

interface LocalEndpointStatus { reachable: boolean; models?: string[]; }

// Server-side reachability probe for the local GPU worker. Fail-soft: any error
// (timeout/ECONNREFUSED/parse) → reachable:false. The provider stays selectable;
// this is only a UI hint, never an auth gate. 1s timeout to keep the page snappy.
async function checkLocalEndpoint(url: string): Promise<LocalEndpointStatus> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return { reachable: false };
    const body = await res.json().catch(() => null) as { data?: { id?: string }[] } | null;
    const models = Array.isArray(body?.data)
      ? body!.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string')
      : undefined;
    return { reachable: true, ...(models && models.length ? { models } : {}) };
  } catch {
    return { reachable: false };
  }
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim());
  const [lmstudio, ollama] = await Promise.all([
    checkLocalEndpoint('http://localhost:1234/v1/models'),
    checkLocalEndpoint('http://localhost:11434/v1/models'),
  ]);
  const body = {
    ANTHROPIC_API_KEY: has('ANTHROPIC_API_KEY'),
    VOYAGE_API_KEY: has('VOYAGE_API_KEY'),
    LLM_ENABLED: process.env.LLM_ENABLED === 'true',
    LLM_HOST_IP: process.env.LLM_HOST_IP?.trim() || null,
    localGpu: { lmstudio, ollama },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
