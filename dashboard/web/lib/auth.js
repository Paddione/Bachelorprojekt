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
    // oauth2-proxy with --set-xauthrequest=true sets X-Auth-Request-User to the
    // OIDC `sub` (a UUID for Keycloak), and X-Auth-Request-Preferred-Username
    // to the human-readable username. PORTAL_ADMIN_USERNAME may list either
    // usernames (e.g. "paddione") or full emails — try each header in turn.
    const candidates = [
      req.headers['x-auth-request-preferred-username'],
      req.headers['x-auth-request-email'],
      req.headers['x-auth-request-user'],
    ];
    const matched = candidates.find(c => typeof c === 'string' && allowed.has(c));
    if (!matched) {
      console.warn('[adminGuard] reject', JSON.stringify({
        path: req.path,
        preferredUsername: req.headers['x-auth-request-preferred-username'] || null,
        email: req.headers['x-auth-request-email'] || null,
        user: req.headers['x-auth-request-user'] || null,
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
