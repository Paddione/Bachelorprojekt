'use strict';

function buildAdminGuard(rawAllowlist) {
  if (process.env.NO_AUTH === 'true') {
    return (req, _res, next) => { req.adminUser = 'dev'; next(); };
  }

  const allowed = new Set(
    String(rawAllowlist || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  return function adminGuard(req, res, next) {
    // oauth2-proxy in reverse-proxy mode (--upstream=...) passes user
    // identity to the upstream as X-Forwarded-* headers (via --pass-user-headers,
    // default-on). The X-Auth-Request-* family is only set on /oauth2/auth
    // responses for the Traefik forward-auth pattern, so reading those alone
    // misses the reverse-proxy case. Try both, falling back to email or user.
    // PORTAL_ADMIN_USERNAME may list either usernames (e.g. "paddione") or
    // full emails (e.g. "patrick@korczewski.de").
    const h = req.headers;
    const candidates = [
      h['x-forwarded-preferred-username'],
      h['x-auth-request-preferred-username'],
      h['x-forwarded-email'],
      h['x-auth-request-email'],
      h['x-forwarded-user'],
      h['x-auth-request-user'],
    ];
    const matched = candidates.find(c => typeof c === 'string' && allowed.has(c));
    if (!matched) {
      console.warn('[adminGuard] reject', JSON.stringify({
        path: req.path,
        fwdPreferredUsername: h['x-forwarded-preferred-username'] || null,
        authPreferredUsername: h['x-auth-request-preferred-username'] || null,
        fwdEmail: h['x-forwarded-email'] || null,
        authEmail: h['x-auth-request-email'] || null,
        fwdUser: h['x-forwarded-user'] || null,
        authUser: h['x-auth-request-user'] || null,
        allowlistSize: allowed.size,
      }));
      res.status(403).send('forbidden');
      return;
    }
    req.adminUser = matched;
    next();
  };
}

module.exports = { buildAdminGuard };
