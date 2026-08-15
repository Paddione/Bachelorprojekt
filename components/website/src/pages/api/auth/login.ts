import type { APIRoute } from 'astro';
import { getLoginUrl } from '../../../lib/auth';

// Redirects the user to Keycloak's login page.
export const GET: APIRoute = async ({ url }) => {
  const returnTo = url.searchParams.get('returnTo') || '/';
  const loginUrl = getLoginUrl(returnTo);
  return new Response(null, {
    status: 302,
    headers: { Location: loginUrl },
  });
};
