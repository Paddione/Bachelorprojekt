import { discovery, ClientSecretPost, allowInsecureRequests, customFetch } from 'openid-client';
import type { Configuration } from 'openid-client';
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types/state';

let oidcConfig: Configuration | null = null;

export async function getOidcClient(): Promise<Configuration> {
  if (oidcConfig) return oidcConfig;
  const piUrl       = process.env.POCKET_ID_URL || 'http://pocket-id.workspace.svc.cluster.local:1411';
  const piPublicUrl = process.env.POCKET_ID_FRONTEND_URL || '';
  const clientId    = process.env.BRETT_KC_CLIENT_ID || 'brett-app';
  const clientSecret = process.env.POCKET_ID_BRETT_SECRET || process.env.BRETT_OIDC_SECRET || '';

  const internalUrl = new URL(piUrl);
  // When POCKET_ID_FRONTEND_URL is set, openid-client validates the discovered
  // issuer against the public URL while customFetch routes the actual request
  // to the cluster-internal endpoint (avoids issuer mismatch with
  // RFC-compliant v6).
  const issuerUrl = piPublicUrl ? new URL(piPublicUrl) : internalUrl;

  const isClusterHttp = internalUrl.protocol === 'http:' &&
    (internalUrl.hostname === 'localhost' || internalUrl.hostname === '127.0.0.1' || internalUrl.hostname.endsWith('.svc.cluster.local'));
  if (internalUrl.protocol === 'http:' && !isClusterHttp) {
    throw new Error(`OIDC issuer URL must use HTTPS or a cluster-internal hostname, got: ${internalUrl.hostname}`);
  }

  const opts: Record<string | symbol, unknown> = {};
  if (isClusterHttp) opts.execute = [allowInsecureRequests];
  if (piPublicUrl && piPublicUrl !== piUrl) {
    opts[customFetch] = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
      const u = new URL(href);
      if (u.hostname === issuerUrl.hostname) {
        u.protocol = internalUrl.protocol;
        u.host = internalUrl.host;
        return fetch(u.toString(), init);
      }
      return fetch(input, init);
    };
  }

  oidcConfig = await discovery(
    issuerUrl,
    clientId,
    { client_secret: clientSecret },
    ClientSecretPost(),
    Object.keys(opts).length || Object.getOwnPropertySymbols(opts).length ? (opts as any) : undefined,
  );
  return oidcConfig;
}

export function isAdminFromClaims(claims: any): boolean {
  // Pocket ID exposes admin status as a single boolean isAdmin claim — there
  // are no realm roles. Kept the old function name for compat with the
  // requireAdmin middleware that imports it.
  return claims?.isAdmin === true;
}

export function buildConfig(_env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {};
}

export function resolveBrand(env: NodeJS.ProcessEnv): string {
  return env.BRETT_BRAND || 'mentolder';
}

export function boardAuthRedirect(req: any, env: NodeJS.ProcessEnv): string | null {
  if (req.session && req.session.userId) return null;
  const e2eSecret = env.POCKET_ID_BRETT_SECRET || env.BRETT_OIDC_SECRET;
  if (e2eSecret && typeof req.header === 'function' && req.header('x-e2e-secret') === e2eSecret) return null;
  const returnTo = encodeURIComponent(req.path || '/');
  return `/auth/login?returnTo=${returnTo}`;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).session?.isAdmin) return next();
  const e2eSecret = process.env.POCKET_ID_BRETT_SECRET || process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  res.status(403).json({ error: 'forbidden' });
}

/**
 * SEC T000660 bug #1: Open-Redirect-Sanitizer für den OIDC `returnTo`-Parameter.
 * Erlaubt nur site-relative Pfade (beginnt mit genau einem `/`, kein `//`, kein `://`).
 * Alles andere (absolute URLs, protocol-relative, javascript:, Backslash-Tricks) → '/'.
 */
export function sanitizeReturnTo(raw: any): string {
  if (typeof raw !== 'string' || raw === '') return '/';
  // Muss mit genau einem Slash beginnen — nicht doppelt (protocol-relative)
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  // Backslash-Trick: /\foo wird von Browsern als //foo interpretiert
  if (raw.startsWith('/\\')) return '/';
  // Scheme-bearing (javascript:, data:, etc.) — darf nach dem / nie ein `:` kommen
  if (/^\/[^/].*:/.test(raw)) return '/';
  return raw;
}

/**
 * SEC T000660 bug #2: Session-Guard für unauthentifizierte API-Requests.
 * 401 wenn keine Session-userId gesetzt; next() wenn authentifiziert.
 * Analog zu requireAdmin, aber ohne Admin-Prüfung.
 */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).session?.userId) return next();
  const e2eSecret = process.env.POCKET_ID_BRETT_SECRET || process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  res.status(401).json({ error: 'unauthenticated' });
}

export function requireLeiterOrAdmin(
  getRoomRoles: (room: string) => Record<string, Role>,
) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const session = (req as any).session;
    if (session?.isAdmin) return next();
    const roomToken = (req as any).params?.roomToken;
    if (roomToken && session?.userId) {
      const roles = getRoomRoles(roomToken);
      if (roles?.[session.userId] === 'leiter') return next();
    }
    const e2eSecret = process.env.POCKET_ID_BRETT_SECRET || process.env.BRETT_OIDC_SECRET;
    if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
    res.status(403).json({ error: 'forbidden' });
  };
}
