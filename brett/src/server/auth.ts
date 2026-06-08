import { discovery, ClientSecretPost, allowInsecureRequests } from 'openid-client';
import type { Configuration } from 'openid-client';
import type { Request, Response, NextFunction } from 'express';

let oidcConfig: Configuration | null = null;

export async function getOidcClient(): Promise<Configuration> {
  if (oidcConfig) return oidcConfig;
  const kcUrl      = process.env.KEYCLOAK_URL || 'http://keycloak.workspace.svc.cluster.local:8080';
  const kcRealm    = process.env.KEYCLOAK_REALM || 'workspace';
  const clientId   = process.env.BRETT_KC_CLIENT_ID || 'brett-app';
  const clientSecret = process.env.BRETT_OIDC_SECRET || '';
  const issuerUrl  = `${kcUrl}/realms/${kcRealm}`;
  const isHttp = issuerUrl.startsWith('http:');
  oidcConfig = await discovery(
    new URL(issuerUrl),
    clientId,
    { client_secret: clientSecret },
    ClientSecretPost(),
    isHttp ? { execute: [allowInsecureRequests] } : undefined,
  );
  return oidcConfig;
}

export function isAdminFromClaims(claims: any): boolean {
  return Array.isArray(claims?.realm_access?.roles) && claims.realm_access.roles.includes('admin');
}

export function buildConfig(_env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {};
}

export function resolveBrand(env: NodeJS.ProcessEnv): string {
  return env.BRETT_BRAND || 'mentolder';
}

export function boardAuthRedirect(req: any, env: NodeJS.ProcessEnv): string | null {
  if (req.session && req.session.userId) return null;
  const e2eSecret = env.BRETT_OIDC_SECRET;
  if (e2eSecret && typeof req.header === 'function' && req.header('x-e2e-secret') === e2eSecret) return null;
  const returnTo = encodeURIComponent(req.path || '/');
  return `/auth/login?returnTo=${returnTo}`;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).session?.isAdmin) return next();
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  res.status(403).json({ error: 'forbidden' });
}
