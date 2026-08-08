export interface AuthProvider {
  id: 'local' | 'fleet';
  frontendUrl: string;
  internalUrl: string;
}

function getPrimaryFrontendUrl(): string {
  return process.env.POCKET_ID_FRONTEND_URL || '';
}

function getPrimaryInternalUrl(): string {
  return process.env.POCKET_ID_URL || 'http://pocket-id:1411';
}

function getFallbackFrontendUrl(): string | undefined {
  return process.env.POCKET_ID_FALLBACK_FRONTEND_URL;
}

function getFallbackInternalUrl(): string | undefined {
  return process.env.POCKET_ID_FALLBACK_URL;
}

const PROVIDER_CACHE_TTL = 30_000;

let cachedProvider: AuthProvider | null | undefined;
let cacheExpiresAt = 0;

export class AuthUnavailableError extends Error {
  constructor() {
    super('No auth provider reachable');
    this.name = 'AuthUnavailableError';
  }
}

export function hasFallbackConfigured(): boolean {
  const frontend = getFallbackFrontendUrl();
  const internal = getFallbackInternalUrl();
  return !!(frontend && internal);
}

export function clearProviderCache(): void {
  cachedProvider = undefined;
  cacheExpiresAt = 0;
}

// Pocket ID serviert die OIDC-Discovery unter /.well-known/openid-configuration.
// Der zuvor allein geprobte Pfad /api/oidc/.well-known/... liefert 404 —
// verifiziert aus dem Website-Pod auf fleet gegen POCKET_ID_URL und gegen den
// lokalen SDLC-Stack (T002680, 2026-08-08). Damit schlug probeProvider()
// IMMER fehl, fuer primary
// wie fallback: resolveAuthProvider() lieferte null und resolveEndpoints()
// warf AuthUnavailableError. Sichtbar wurde das erst beim Token-Exchange
// ("No auth provider reachable for token exchange" -> auth_error=exchange_failed),
// weil der Authorize-Redirect ueber resolveEndpointsSync() laeuft, das ohne
// Probe auf 'local' zurueckfaellt.
//
// Beide Pfade werden geprobt, damit der Fix nicht an einer Pocket-ID-Version
// haengt: der erste Treffer gewinnt.
const DISCOVERY_PATHS = [
  '/.well-known/openid-configuration',
  '/api/oidc/.well-known/openid-configuration',
];

async function probeProvider(internalUrl: string): Promise<boolean> {
  for (const path of DISCOVERY_PATHS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${internalUrl}${path}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return true;
    } catch {
      // naechsten Pfad versuchen; erst wenn alle scheitern, gilt der
      // Provider als nicht erreichbar.
    }
  }
  return false;
}

export async function resolveAuthProvider(): Promise<AuthProvider | null> {
  if (cachedProvider !== undefined && Date.now() < cacheExpiresAt) {
    return cachedProvider;
  }

  const primaryInternalUrl = getPrimaryInternalUrl();
  const primaryFrontendUrl = getPrimaryFrontendUrl();

  if (await probeProvider(primaryInternalUrl)) {
    cachedProvider = {
      id: 'local',
      frontendUrl: primaryFrontendUrl,
      internalUrl: primaryInternalUrl,
    };
    cacheExpiresAt = Date.now() + PROVIDER_CACHE_TTL;
    return cachedProvider;
  }

  if (hasFallbackConfigured()) {
    const fallbackFrontendUrl = getFallbackFrontendUrl()!;
    const fallbackInternalUrl = getFallbackInternalUrl()!;
    if (await probeProvider(fallbackInternalUrl)) {
      cachedProvider = {
        id: 'fleet',
        frontendUrl: fallbackFrontendUrl,
        internalUrl: fallbackInternalUrl,
      };
      cacheExpiresAt = Date.now() + PROVIDER_CACHE_TTL;
      return cachedProvider;
    }
  }

  cachedProvider = null;
  cacheExpiresAt = Date.now() + PROVIDER_CACHE_TTL;
  return null;
}

export async function resolveEndpoints(): Promise<{
  auth: string;
  token: string;
  userinfo: string;
  logout: string;
}> {
  const provider = await resolveAuthProvider();
  if (!provider) {
    throw new AuthUnavailableError();
  }
  return buildEndpoints(provider);
}

export function resolveEndpointsSync(): {
  auth: string;
  token: string;
  userinfo: string;
  logout: string;
} {
  if (cachedProvider !== undefined && cachedProvider !== null && Date.now() < cacheExpiresAt) {
    return buildEndpoints(cachedProvider);
  }
  return buildEndpoints({
    id: 'local',
    frontendUrl: getPrimaryFrontendUrl(),
    internalUrl: getPrimaryInternalUrl(),
  });
}

function buildEndpoints(provider: AuthProvider) {
  return {
    auth: `${provider.frontendUrl}/authorize`,
    token: `${provider.internalUrl}/api/oidc/token`,
    userinfo: `${provider.internalUrl}/api/oidc/userinfo`,
    logout: `${provider.frontendUrl}/api/oidc/end-session`,
  };
}
