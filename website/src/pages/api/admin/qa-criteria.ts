import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { QA_CRITERIA } from '../../../lib/qa-dal';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ criteria: QA_CRITERIA }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
