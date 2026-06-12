// brett/src/server/routes/auth.ts
// OIDC/Keycloak-Auth-Routen.

import { Router } from 'express';
import { buildAuthorizationUrl, authorizationCodeGrant } from 'openid-client';
import * as auth from '../auth';

export const authRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Resolve the identity an /auth/e2e-login request asks for. The endpoint accepts
 * optional `userId`/`name`/`isAdmin` so two browser contexts can hold DISTINCT,
 * role-distinct identities (required by the C7 observer-gate E2E). Defaults match
 * the historical single-admin behavior. `isAdmin` defaults to true and is only
 * forced false when explicitly `false` (so a non-admin context can be created;
 * the C7 test keeps both admins to prove enforcement keys on ROLE, not isAdmin).
 */
export function resolveE2eIdentity(body: any): { userId: string; name: string; isAdmin: boolean } {
  const b = body || {};
  return {
    userId: typeof b.userId === 'string' && b.userId ? b.userId : 'e2e-admin',
    name: typeof b.name === 'string' && b.name ? b.name : 'E2E Admin',
    isAdmin: b.isAdmin === false ? false : true,
  };
}

const BRETT_PUBLIC_URL = process.env.BRETT_PUBLIC_URL || 'http://brett.localhost';

authRouter.get('/auth/login', asyncHandler(async (req: any, res: any) => {
  const config = await auth.getOidcClient();
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
  const redirectUri = `${BRETT_PUBLIC_URL}/auth/callback`;
  const url = buildAuthorizationUrl(config, { scope: 'openid profile', redirect_uri: redirectUri, state });
  res.redirect(url.toString());
}));

authRouter.get('/auth/callback', asyncHandler(async (req: any, res: any) => {
  const config = await auth.getOidcClient();
  const host = (req.headers.host as string) || 'localhost';
  const proto = (req.protocol as string) || 'http';
  const currentUrl = new URL(req.url as string, `${proto}://${host}`);
  const incomingState = currentUrl.searchParams.get('state') ?? '';
  const tokens = await authorizationCodeGrant(config, currentUrl, { expectedState: incomingState });
  const claims = tokens.claims();
  let returnTo = '/';
  try { returnTo = auth.sanitizeReturnTo(JSON.parse(Buffer.from(currentUrl.searchParams.get('state') || '', 'base64url').toString()).returnTo); } catch {}
  req.session.userId   = claims?.sub;
  req.session.name     = (claims as any)?.name || (claims as any)?.preferred_username || claims?.sub;
  req.session.isAdmin  = auth.isAdminFromClaims(claims);
  res.redirect(returnTo);
}));

authRouter.get('/auth/me', (req: any, res: any) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  res.json({ authenticated: true, userId: req.session.userId, name: req.session.name, isAdmin: !!req.session.isAdmin });
});

authRouter.post('/auth/e2e-login', (req: any, res: any) => {
  const secret = process.env.BRETT_OIDC_SECRET;
  if (!secret || req.header('x-e2e-secret') !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const ident = resolveE2eIdentity(req.body);
  req.session.userId = ident.userId;
  req.session.name = ident.name;
  req.session.isAdmin = ident.isAdmin;
  req.session.save((err: any) => {
    if (err) return res.status(500).json({ error: 'session save failed' });
    return res.json({ success: true, userId: ident.userId, isAdmin: ident.isAdmin });
  });
});
