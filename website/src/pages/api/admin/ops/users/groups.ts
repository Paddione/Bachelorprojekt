import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listGroups } from '../../../../../lib/keycloak';
import { sanitizeForLog } from '../../../../../lib/sanitize';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });
  try {
    const groups = await listGroups();
    return new Response(JSON.stringify({ groups }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Gruppen konnten nicht geladen werden: ' + sanitizeForLog((err as Error).message) }), { status: 503 });
  }
};
