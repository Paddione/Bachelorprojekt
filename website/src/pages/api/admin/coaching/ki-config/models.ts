import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { fetchModelIds } from '../../../../../lib/llm-models-probe';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let baseUrl = process.env.LLM_HOST_IP?.trim();
  if (!baseUrl) {
    baseUrl = 'localhost';
  }

  const result = await fetchModelIds(`http://${baseUrl}:1234/v1`, 2000);

  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
