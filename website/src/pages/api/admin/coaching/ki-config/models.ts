import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getKiProviderById } from '../../../../../lib/coaching-ki-config-db';
import { resolveEndpoint } from '../../../../../lib/openai-compatible-session-agent';
import { fetchModelIds } from '../../../../../lib/llm-models-probe';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);

  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id)) return json({ reachable: false, models: [] }, 200);

  const config = await getKiProviderById(null as unknown as any, id);
  if (!config) return json({ reachable: false, models: [] }, 200);

  let baseUrl: string;
  try { baseUrl = resolveEndpoint(config); }
  catch { return json({ reachable: false, models: [] }, 200); }

  return json(await fetchModelIds(baseUrl, 2000), 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
