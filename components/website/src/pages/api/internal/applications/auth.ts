import { timingSafeEqual } from 'node:crypto';
import { getSession, isAdmin } from '../../../../lib/auth';

/**
 * Authorizes a request to the internal applications API.
 * Accepts either a valid x-internal-token header (for internal service calls)
 * or an authenticated admin session cookie (for frontend admin cockpit calls).
 * Tokenvergleich in konstanter Zeit (F7); Env wird pro Request gelesen,
 * damit Tests und rotierte Secrets ohne Neustart greifen.
 */
export async function isAuthorized(request: Request): Promise<boolean> {
  const token = process.env.INTERNAL_API_TOKEN ?? '';
  const provided = request.headers.get('x-internal-token') ?? '';
  if (token && provided.length === token.length) {
    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(provided))) return true;
    } catch {
      // Faellt auf Session-Pruefung zurueck.
    }
  }
  const session = await getSession(request.headers.get('cookie'));
  return Boolean(session && isAdmin(session));
}
