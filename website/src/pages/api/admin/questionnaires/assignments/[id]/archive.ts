import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { archiveQAssignment } from '../../../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!params.id) {
    return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });
  }

  const result = await archiveQAssignment(params.id);
  if ('reason' in result) {
    if (result.reason === 'not_found') {
      return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
    }
    return new Response(JSON.stringify({
      error: `Fragebogen kann im Status '${result.status}' nicht archiviert werden.`,
      status: result.status,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ assignment: result.assignment }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
