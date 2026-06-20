import type { APIRoute } from 'astro';
import { exchangeCode, isAdmin, setSessionCookie } from '../../../lib/auth';
import { errorResponse } from '../_errors';

// Keycloak redirects here after successful login.
// Exchanges the authorization code for tokens and creates a session.
export const GET: APIRoute = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state') || '/';
  const error = url.searchParams.get('error');

  if (error) {
    locals.requestLogger.error({ error, description: url.searchParams.get('error_description') }, '[auth] OIDC error:');
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

  // Only redirect to safe relative paths. Protocol-relative URLs like //evil.com
  // start with "/" but would redirect off-site, so reject anything with "//".
  const isSafePath = rawState.startsWith('/') && !rawState.startsWith('//') && !rawState.includes('\n') && !rawState.includes('\r');
  const destination = isSafePath
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
