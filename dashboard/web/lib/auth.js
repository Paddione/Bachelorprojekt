'use strict';

function buildAdminGuard(rawAllowlist) {
  const allowed = new Set(
    String(rawAllowlist || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  return function adminGuard(req, res, next) {
    const user = req.headers['x-auth-request-user'];
    if (typeof user !== 'string' || !allowed.has(user)) {
      res.status(403).send('forbidden');
      return;
    }
    req.adminUser = user;
    next();
  };
}

module.exports = { buildAdminGuard };
