import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { listProjectsForCustomer } from '../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const projects = await listProjectsForCustomer(session.sub);
  return new Response(JSON.stringify(projects), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
