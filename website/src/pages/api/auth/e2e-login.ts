import type { APIRoute } from 'astro';
import { issueSession, setSessionCookie } from '../../../lib/auth';
import { listUsers } from '../../../lib/identity';

const E2E_SECRET = process.env.CRON_SECRET ?? '';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const auth = request.headers.get('authorization') || '';
  const tokenHeader = auth.replace(/^Bearer\s+/i, '');
  const tokenQuery = url.searchParams.get('token') || '';
  const token = tokenHeader || tokenQuery;

  if (E2E_SECRET && token !== E2E_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const username = url.searchParams.get('username') || '';

  const users = await listUsers();
  // Exact match first, then case-insensitive fallback (T002068: Pocket-ID
  // stores `Paddione`, e2e harness sends `paddione`).
  const user =
    users.find(u => u.username === username || u.email === username) ??
    users.find(
      u =>
        u.username.toLowerCase() === username.toLowerCase() ||
        (u.email?.toLowerCase() ?? '') === username.toLowerCase(),
    );
  if (!user) {
    return new Response(JSON.stringify({ error: `user "${username}" not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const returnTo = url.searchParams.get('returnTo') || '/admin';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const sessionId = await issueSession({
    sub: user.id,
    email: user.email || '',
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    preferred_username: user.username,
    given_name: user.firstName,
    family_name: user.lastName,
    realmRoles: user.isAdmin ? ['admin'] : [],
    brand: process.env.BRAND_ID ?? process.env.BRAND ?? null,
    access_token: '',
    refresh_token: '',
    expires_at: Date.now() + SESSION_TTL_MS,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: returnTo,
      'Set-Cookie': setSessionCookie(sessionId),
    },
  });
};
