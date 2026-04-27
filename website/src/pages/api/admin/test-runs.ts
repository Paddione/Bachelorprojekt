import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listTestRuns } from '../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const runs = await listTestRuns(20);
  return new Response(JSON.stringify(runs), {
    headers: { 'Content-Type': 'application/json' },
  });
};
