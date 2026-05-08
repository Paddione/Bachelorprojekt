// GET /api/auth/magic?token=<token>
//
// Redeems a system-test magic-link token: validates the row in
// `systemtest_magic_tokens`, mints a fresh `web_sessions` row impersonating
// the seeded user, sets the workspace_session cookie, and 302s to the
// originally-requested redirect_uri.
//
// Refuses tokens that are missing, used, or past their expires_at — returns
// a 410 with a static HTML page instructing the operator to re-issue the
// magic-link from the questionnaire admin UI.

import type { APIRoute } from 'astro';
import { redeemMagicToken } from '../../../lib/auth/magic-link';
import { issueSession, setSessionCookie } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  if (!token) {
    return new Response('missing token', { status: 400 });
  }

  const result = await redeemMagicToken(token);
  if (!result.ok) {
    const reason = result.reason;
    const reasonText =
      reason === 'expired' ? 'Magic link expired.' :
      reason === 'used'    ? 'Magic link already used.' :
      reason === 'unknown' ? 'Magic link not found.' :
                             'Invalid magic link.';
    return new Response(
      '<!doctype html><html><body>' +
      `<p>${reasonText}</p>` +
      '<p>Ask the admin to <em>Reissue magic link</em> from the questionnaire.</p>' +
      '</body></html>',
      { status: 410, headers: { 'content-type': 'text/html' } },
    );
  }

  const sessionId = await issueSession(result.user);
  return new Response(null, {
    status: 302,
    headers: {
      'set-cookie': setSessionCookie(sessionId),
      location: result.redirectUri,
    },
  });
};
