import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { corsHeaders, handlePreflight } from '../../../lib/cors';

// Returns the current user's session info as JSON.
// Used by client-side Svelte components AND the cross-origin React SPA
// (react.<brand>) to check auth state. CORS headers are added fail-closed for
// allowlisted origins so the credentialed cross-origin fetch can read it.

export const OPTIONS: APIRoute = ({ request }) => {
  return handlePreflight(request) as Response;
};

export const GET: APIRoute = async ({ request }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  const session = await getSession(request.headers.get('cookie'));

  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      expiresAt: session.expires_at,
      user: {
        name: session.name,
        email: session.email,
        username: session.preferred_username,
        givenName: session.given_name,
        familyName: session.family_name,
        isAdmin: isAdmin(session),
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    }
  );
};
