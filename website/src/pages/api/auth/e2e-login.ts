import type { APIRoute } from 'astro';
import { issueSession, setSessionCookie } from '../../../lib/auth';
import { listUsers } from '../../../lib/identity';

const E2E_SECRET = process.env.CRON_SECRET ?? '';

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token !== E2E_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const username = url.searchParams.get('username') || '';

  const users = await listUsers();
  const user = users.find(
    u => u.username === username || u.email === username,
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
