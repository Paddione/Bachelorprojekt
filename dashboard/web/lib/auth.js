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
    // to the human-readable username. The allowlist (PORTAL_ADMIN_USERNAME) is
    // a comma-separated list of usernames, so prefer the username header.
    const user =
      req.headers['x-auth-request-preferred-username'] ||
      req.headers['x-auth-request-user'];
    if (typeof user !== 'string' || !allowed.has(user)) {
      res.status(403).send('forbidden');
      return;
    }
    req.adminUser = user;
    next();
  };
}

module.exports = { buildAdminGuard };
