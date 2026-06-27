import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { corsHeaders, handlePreflight } from '../../../../lib/cors';
import { listVersions } from '../../../../lib/homepage-blocks-store';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const OPTIONS: APIRoute = ({ request }) => handlePreflight(request) as Response;

export const GET: APIRoute = async ({ request }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }
  const list = await listVersions(BRAND);
  return new Response(JSON.stringify(list), {
    status: 200,
    headers: { 'content-type': 'application/json', ...cors },
  });
};
