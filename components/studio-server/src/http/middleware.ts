import type { RequestHandler } from 'express';
import { verifyStudioJwt, type StudioClaims, type TrustedIssuer } from '../auth/jwt';

declare global {
  namespace Express { interface Request { user?: StudioClaims; } }
}

export interface AuthMiddleware { requireUser: RequestHandler; }

export function makeAuthMiddleware(opts: { issuers: TrustedIssuer[]; audience?: string }): AuthMiddleware {
  const requireUser: RequestHandler = async (req, res, next) => {
    const header = req.header('x-forwarded-access-token')
      || (req.header('authorization')?.startsWith('Bearer ')
          ? req.header('authorization')!.slice(7)
          : null);
    if (!header) { res.status(401).json({ error: 'unauthorized' }); return; }
    try {
      const claims = await verifyStudioJwt(header, {
        trustedIssuers: opts.issuers,
        audience: opts.audience ?? 'studio',
      });
      req.user = claims;
      next();
    } catch (e: any) {
      res.status(401).json({ error: 'invalid token', detail: e.message });
    }
  };
  return { requireUser };
}
