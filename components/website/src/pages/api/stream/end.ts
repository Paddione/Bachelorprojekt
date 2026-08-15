// website/src/pages/api/stream/end.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ingressDeleted: 0, participantsRemoved: 0, errors: [] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
