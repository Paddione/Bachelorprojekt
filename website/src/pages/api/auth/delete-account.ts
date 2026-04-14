import type { APIRoute } from 'astro';
import { getSession, getSessionId, getLogoutUrl, clearSessionCookie } from '../../../lib/auth';
import { deleteUser } from '../../../lib/keycloak';

export const POST: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get('cookie');
  const session = await getSession(cookieHeader);

  if (!session) {
    return new Response(JSON.stringify({ error: 'Nicht angemeldet.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = session.sub;
  const deleted = await deleteUser(userId);

  if (!deleted) {
    return new Response(JSON.stringify({ error: 'Konto konnte nicht gelöscht werden.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Clean up session (best-effort)
  const sessionId = getSessionId(cookieHeader);
  try {
    await getLogoutUrl(sessionId); // this deletes the DB session row
  } catch { /* best-effort */ }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
};
