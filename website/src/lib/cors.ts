// CORS allowlist helper for cross-origin (same-site) requests from the
// React SPA at react.<brand>. Fail-closed: only origins listed in the
// REACT_APP_ORIGIN env (comma-separable) get credentialed CORS headers.
// The exact requesting origin is reflected — never a wildcard — which is
// mandatory when Access-Control-Allow-Credentials is true.
//
// REACT_APP_ORIGIN is a runtime value (set via the website-config ConfigMap),
// so it is read from process.env at call time rather than the build-time
// import.meta.env snapshot.

function allowedOrigins(): string[] {
  const raw = process.env.REACT_APP_ORIGIN ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

/**
 * Headers to merge onto a response for a (potentially) cross-origin request.
 * Allowlisted origin → reflect it + allow credentials. Anything else →
 * only `Vary: Origin` (no grant) so caches never serve a credentialed
 * response to the wrong origin.
 */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin as string;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

const ALLOW_METHODS = 'GET, POST, OPTIONS';
const ALLOW_HEADERS = 'content-type';

/**
 * Answer a CORS preflight. Returns a 204 response (with CORS grant headers
 * only for allowlisted origins) when the request is an OPTIONS preflight,
 * otherwise null so the route's real handler runs.
 */
export function handlePreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    ...corsHeaders(origin),
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '600',
  };
  return new Response(null, { status: 204, headers });
}
