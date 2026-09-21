import { getSession, isAdmin } from '../../../../lib/auth';

/**
 * Authorizes a request to the internal applications API.
 * Accepts either a valid x-internal-token header (for internal service calls)
 * or an authenticated admin session cookie (for frontend admin cockpit calls).
 */
export async function isAuthorized(request: Request): Promise<boolean> {
  const token = process.env.INTERNAL_API_TOKEN ?? '';
  if (token && request.headers.get('x-internal-token') === token) {
    return true;
  }
  const session = await getSession(request.headers.get('cookie'));
  return Boolean(session && isAdmin(session));
}
