import type { RequestHandler } from 'express';
import { verifyArenaJwt, playerKey, type ArenaClaims, type TrustedIssuer } from '../auth/jwt';

declare global {
  namespace Express { interface Request { user?: ArenaClaims; userKey?: string; } }
}

export interface AuthMiddleware {
  requireUser: RequestHandler;
  requireAdmin: RequestHandler;
}

export function makeAuthMiddleware(opts: { issuers: TrustedIssuer[] }): AuthMiddleware {
  const requireUser: RequestHandler = async (req, res, next) => {
    const h = req.header('authorization');
    if (!h || !h.startsWith('Bearer ')) { res.status(401).json({ error: 'missing bearer' }); return; }
    try {
      const claims = await verifyArenaJwt(h.slice(7), { trustedIssuers: opts.issuers });
      req.user = claims;
      req.userKey = playerKey(claims);
      next();
    } catch (e: any) {
      res.status(401).json({ error: 'invalid token', detail: e.message });
    }
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    if (!req.user) { res.status(401).json({ error: 'unauthenticated' }); return; }
    if (!req.user.realmRoles.includes('arena_admin')) {
      res.status(403).json({ error: 'arena_admin role required' }); return;
    }
    next();
  };

  return { requireUser, requireAdmin };
}
