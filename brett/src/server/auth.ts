import { discovery, ClientSecretPost, allowInsecureRequests, customFetch } from 'openid-client';
import type { Configuration } from 'openid-client';
import type { Request, Response, NextFunction } from 'express';

let oidcConfig: Configuration | null = null;

export async function getOidcClient(): Promise<Configuration> {
  if (oidcConfig) return oidcConfig;
  const kcUrl       = process.env.KEYCLOAK_URL || 'http://keycloak.workspace.svc.cluster.local:8080';
  const kcPublicUrl = process.env.KEYCLOAK_PUBLIC_URL || '';
  const kcRealm     = process.env.KEYCLOAK_REALM || 'workspace';
  const clientId    = process.env.BRETT_KC_CLIENT_ID || 'brett-app';
  const clientSecret = process.env.BRETT_OIDC_SECRET || '';

  const internalUrl = new URL(`${kcUrl}/realms/${kcRealm}`);
  // When KEYCLOAK_PUBLIC_URL is set, openid-client validates the discovered issuer
  // against the public URL while customFetch routes the actual request to the
  // cluster-internal endpoint (avoids issuer mismatch with RFC-compliant v6).
  const issuerUrl = kcPublicUrl ? new URL(`${kcPublicUrl}/realms/${kcRealm}`) : internalUrl;

  const isClusterHttp = internalUrl.protocol === 'http:' &&
    (internalUrl.hostname === 'localhost' || internalUrl.hostname === '127.0.0.1' || internalUrl.hostname.endsWith('.svc.cluster.local'));
  if (internalUrl.protocol === 'http:' && !isClusterHttp) {
    throw new Error(`OIDC issuer URL must use HTTPS or a cluster-internal hostname, got: ${internalUrl.hostname}`);
  }

  const opts: Record<string | symbol, unknown> = {};
  if (isClusterHttp) opts.execute = [allowInsecureRequests];
  if (kcPublicUrl && kcPublicUrl !== kcUrl) {
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
