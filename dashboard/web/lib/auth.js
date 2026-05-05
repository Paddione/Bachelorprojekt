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
