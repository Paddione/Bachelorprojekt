import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { POLL_TEMPLATES } from '../../../../lib/poll-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return new Response(JSON.stringify({ templates: POLL_TEMPLATES }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
