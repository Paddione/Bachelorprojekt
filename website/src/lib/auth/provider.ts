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

// Warum resolveEndpointsSync() auf den ungeprobten Zweig faellt. Die drei Faelle
// sind NICHT gleich schwerwiegend:
//
//   'never-probed'  — es gab in diesem Prozess noch keine Probe. Kein Wissen
//                     ueber den Provider, also auch kein ignoriertes Wissen.
//   'cache-expired' — die letzte Probe ist aelter als PROVIDER_CACHE_TTL.
//                     Veraltetes Wissen; der Provider kann laengst zurueck sein.
//   'probe-failed'  — eine FRISCHE Probe hat ergeben, dass kein Provider
//                     erreichbar ist (cachedProvider === null, TTL laeuft noch).
//                     Hier liegt positives Wissen ueber den Ausfall vor und der
//                     Sync-Pfad baut trotzdem eine Login-URL. Genau dieser Fall
//                     verdeckte T002680 bis nach der Credential-Eingabe.
type SyncFallbackReason = 'never-probed' | 'cache-expired' | 'probe-failed';

/**
 * Wird aufgerufen, kurz bevor resolveEndpointsSync() Endpoints aus einem NICHT
 * geprobten Provider baut. Aktuell ein No-op — das Verhalten ist damit exakt das
 * bisherige (fail-open, siehe Variante b unten).
 *
 * TODO(T002682): Verhalten festlegen. Zur Wahl stehen:
 *
 *   a) fail-closed — bei 'probe-failed' (ggf. auch 'cache-expired') werfen.
 *      Der Login schlaegt sofort sichtbar fehl statt erst im Callback.
 *      ACHTUNG: Der einzige Produktions-Aufrufer ist getLoginUrl() in
 *      website/src/lib/auth.ts:90. Die Funktion ist synchron und gibt `string`
 *      zurueck; ein Wurf muss dort und in /api/auth/login behandelt werden
 *      (503 statt kaputtem Redirect). Das ist der teuerste, aber ehrlichste Weg.
 *
 *   b) fail-open — No-op belassen. Robust gegen kurzes Pocket-ID-Flackern,
 *      verschiebt den Fehler aber weiterhin hinter die Credential-Eingabe.
 *
 *   c) tolerant + laut — Login bleibt tolerant, aber der Rueckfall wird
 *      protokolliert bzw. als Health-Signal exponiert. Naheliegender Kompromiss;
 *      dann vermutlich nach `reason` differenzieren, damit 'never-probed' beim
 *      Kaltstart kein Fehler-Rauschen erzeugt.
 *
 * Die Wahl praegt das Verhalten bei JEDEM kuenftigen Pocket-ID-Ausfall — sie ist
 * eine Betriebs-, keine Implementierungsentscheidung.
 */
function onUnprobedFallback(_reason: SyncFallbackReason, _provider: AuthProvider): void {
  // TODO(T002682): siehe oben.
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

  const cacheStillValid = Date.now() < cacheExpiresAt;
  const reason: SyncFallbackReason =
    cachedProvider === undefined
      ? 'never-probed'
      : cachedProvider === null && cacheStillValid
        ? 'probe-failed'
        : 'cache-expired';

  const fallback: AuthProvider = {
    id: 'local',
    frontendUrl: getPrimaryFrontendUrl(),
    internalUrl: getPrimaryInternalUrl(),
  };
  onUnprobedFallback(reason, fallback);
  return buildEndpoints(fallback);
}

function buildEndpoints(provider: AuthProvider) {
  return {
    auth: `${provider.frontendUrl}/authorize`,
    token: `${provider.internalUrl}/api/oidc/token`,
    userinfo: `${provider.internalUrl}/api/oidc/userinfo`,
    logout: `${provider.frontendUrl}/api/oidc/end-session`,
  };
}
