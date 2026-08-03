import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { fetchModelIds } from '../../../../lib/llm-models-probe';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim());
  // When LLM_HOST_IP is set (cluster/prod), probe the GPU worker via its wg-mesh IP —
  // the pod can reach it via the existing llm-gateway Services. Fallback: localhost (dev).
  const gpuBase = process.env.LLM_HOST_IP?.trim() || 'localhost';
  const [lmstudio, ollama] = await Promise.all([
    fetchModelIds(`http://${gpuBase}:1234/v1`, 1000),
    fetchModelIds(`http://${gpuBase}:11434/v1`, 1000),
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
