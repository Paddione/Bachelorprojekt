import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listUsers } from '../../../../../lib/keycloak';
import { sanitizeForLog } from '../../../../../lib/sanitize';

export const GET: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });
  try {
    const users = await listUsers();
    return new Response(JSON.stringify({ users }), { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[ops/users/list]');
    return new Response(JSON.stringify({ error: 'Anwender konnten nicht geladen werden: ' + sanitizeForLog((err as Error).message) }), { status: 503 });
  }
};
