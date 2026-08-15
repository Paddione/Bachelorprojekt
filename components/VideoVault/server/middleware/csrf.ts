import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/processing/movies/rescan',
  '/api/processing/hdd-ext/index',
  '/api/processing/hdd-ext/process',
  '/api/processing/hdd-ext/rescan',
]);
const CSRF_HEADER = 'x-csrf-token';

function ensureCsrfToken(req: Request): string {
  if (!req.session) {
    throw new Error('Session middleware is required for CSRF tokens.');
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.csrfTokenIssuedAt = Date.now();
  }

  return req.session.csrfToken;
}

function getRequestToken(req: Request): string | null {
  const header = req.get(CSRF_HEADER);
  return typeof header === 'string' && header.length > 0 ? header : null;
}

function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function attachCsrfToken(req: Request, _res: Response, next: NextFunction) {
  (req as Request & { csrfToken?: () => string }).csrfToken = () => ensureCsrfToken(req);
  next();
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.originalUrl)) {
    return next();
  }

  const sessionToken = req.session?.csrfToken;
  const requestToken = getRequestToken(req);

  if (!sessionToken || !requestToken || !tokensMatch(sessionToken, requestToken)) {
    const error = new Error('Invalid CSRF token') as Error & { code?: string };
    error.code = 'EBADCSRFTOKEN';
    return next(error);
  }

  return next();
}
