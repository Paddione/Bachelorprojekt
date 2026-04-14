import type { APIRoute } from 'astro';
import { getLogoutUrl, getSessionId, clearSessionCookie } from '../../../lib/auth';

// Logs the user out by clearing the session and redirecting to Keycloak's logout.
export const GET: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get('cookie');
  const sessionId = getSessionId(cookieHeader);
  const logoutUrl = await getLogoutUrl(sessionId);

  return new Response(null, {
    status: 302,
    headers: {
      Location: logoutUrl,
      'Set-Cookie': clearSessionCookie(),
    },
  });
};
