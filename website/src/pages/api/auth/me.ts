import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

// Returns the current user's session info as JSON.
// Used by client-side Svelte components to check auth state.
export const GET: APIRoute = async ({ request }) => {
  const session = getSession(request.headers.get('cookie'));

  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: {
        name: session.name,
        email: session.email,
        username: session.preferred_username,
        givenName: session.given_name,
        familyName: session.family_name,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
