import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { reassignQAssignment } from '../../../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!params.id) {
    return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });
  }

  const result = await reassignQAssignment(params.id);
  if ('reason' in result) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
  const portalUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/portal/fragebogen/${result.assignment.id}`
    : `/portal/fragebogen/${result.assignment.id}`;
  return new Response(JSON.stringify({
    assignment: result.assignment, portalUrl,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
