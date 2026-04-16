import type { APIRoute } from 'astro';
import { exchangeCode, isAdmin, setSessionCookie } from '../../../lib/auth';

// Keycloak redirects here after successful login.
// Exchanges the authorization code for tokens and creates a session.
export const GET: APIRoute = async ({ url }) => {
  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state') || '/';
  const error = url.searchParams.get('error');

  if (error) {
    console.error('[auth] OIDC error:', error, url.searchParams.get('error_description'));
    return new Response(null, {
      status: 302,
      headers: { Location: '/?auth_error=1' },
    });
  }

  if (!code) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?auth_error=no_code' },
    });
  }

  const result = await exchangeCode(code);

  if (!result) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?auth_error=exchange_failed' },
    });
  }

  // Only use state as a redirect if it's an internal path — Keycloak also uses
  // the state param for its own CSRF token when no state was supplied by us.
  const destination = rawState.startsWith('/')
    ? rawState
    : (isAdmin(result.user) ? '/admin' : '/portal');

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Set-Cookie': setSessionCookie(result.sessionId),
    },
  });
};
