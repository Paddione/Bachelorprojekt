import type { APIRoute } from 'astro';
import { exchangeCode, isAdmin, setSessionCookie } from '../../../lib/auth';

// Origins (besides safe relative paths) that a post-login `returnTo`/`state`
// may redirect to. The cross-origin React SPA (react.<brand>) reuses this
// Astro auth, so its origin must be allowlisted — but ONLY via env, never a
// literal. SITE_URL covers same-origin absolute URLs; REACT_APP_ORIGIN
// (comma-separable) covers the React SPA origin(s). Read from process.env at
// call time (runtime values, not the build-time import.meta.env snapshot).
function allowedReturnOrigins(): string[] {
  const origins: string[] = [];
  const site = process.env.SITE_URL;
  if (site) {
    try { origins.push(new URL(site).origin); } catch { /* ignore malformed SITE_URL */ }
  }
  const react = process.env.REACT_APP_ORIGIN ?? '';
  for (const raw of react.split(',').map((s) => s.trim()).filter(Boolean)) {
    try { origins.push(new URL(raw).origin); } catch { /* ignore malformed entry */ }
  }
  return origins;
}

/**
 * Resolve the post-login redirect target, fail-closed.
 * - Safe relative paths (start with "/", not "//", no CR/LF) pass through
 *   unchanged — the original open-redirect guard.
 * - Absolute http(s) URLs are allowed ONLY when their origin is allowlisted
 *   (SITE_URL origin or a REACT_APP_ORIGIN entry).
 * - Everything else (foreign origin, javascript:, protocol-relative, garbage)
 *   falls back to the safe default.
 */
export function resolveReturnTo(rawState: string, fallback: string): string {
  if (
    rawState.startsWith('/') &&
    !rawState.startsWith('//') &&
    // Browsers normalize backslashes to forward slashes in the authority
    // position, so "/\evil.com" → "//evil.com" → off-site. Reject any backslash.
    !rawState.includes('\\') &&
    !rawState.includes('\n') &&
    !rawState.includes('\r')
  ) {
    return rawState;
  }
  try {
    const u = new URL(rawState);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && allowedReturnOrigins().includes(u.origin)) {
      // Return the normalized URL (URL parsing strips tab/CR/LF) so the two
      // branches can't diverge — never echo the raw, unnormalized input.
      return u.href;
    }
  } catch { /* not a parseable absolute URL */ }
  return fallback;
}

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

  const destination = resolveReturnTo(rawState, isAdmin(result.user) ? '/admin' : '/portal');

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Set-Cookie': setSessionCookie(result.sessionId),
    },
  });
};
