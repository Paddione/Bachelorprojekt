import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listAllMeetings } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const url = new URL(request.url);
  const unassignedOnly = url.searchParams.get('unassigned') === '1';

  const meetings = await listAllMeetings({ unassignedOnly });
  return new Response(JSON.stringify(meetings), {
    headers: { 'Content-Type': 'application/json' },
  });
};
