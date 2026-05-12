// OIDC authentication helper for Keycloak.
// Implements Authorization Code Flow with cookie-based sessions.

const KC_FRONTEND_URL = process.env.KEYCLOAK_FRONTEND_URL || '';
const KC_INTERNAL_URL = process.env.KEYCLOAK_URL || 'http://keycloak.workspace.svc.cluster.local:8080';
const KC_REALM = process.env.KEYCLOAK_REALM || 'workspace';
const CLIENT_ID = 'website';
const CLIENT_SECRET = process.env.WEBSITE_OIDC_SECRET || 'devwebsiteoidcsecret12345';
const SITE_URL = process.env.SITE_URL || '';
const CALLBACK_PATH = '/api/auth/callback';
const COOKIE_NAME = 'workspace_session';

// Well-known OIDC endpoints
const ISSUER_FRONTEND = `${KC_FRONTEND_URL}/realms/${KC_REALM}`;
const ISSUER_INTERNAL = `${KC_INTERNAL_URL}/realms/${KC_REALM}`;
const AUTH_ENDPOINT = `${ISSUER_FRONTEND}/protocol/openid-connect/auth`;
const TOKEN_ENDPOINT = `${ISSUER_INTERNAL}/protocol/openid-connect/token`;
const USERINFO_ENDPOINT = `${ISSUER_INTERNAL}/protocol/openid-connect/userinfo`;
const LOGOUT_ENDPOINT = `${ISSUER_FRONTEND}/protocol/openid-connect/logout`;

export interface UserSession {
  sub: string;
  email: string;
  name: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  realmRoles: string[];
  brand: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeRealmRoles(accessToken: string): string[] {
  const claims = decodeJwtPayload(accessToken);
  const roles = (claims?.realm_access as { roles?: unknown } | undefined)?.roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

function tokenHasAudience(accessToken: string, audience: string): boolean {
  const claims = decodeJwtPayload(accessToken);
  const aud = claims?.aud;
  if (typeof aud === 'string') return aud === audience;
  if (Array.isArray(aud)) return aud.includes(audience);
  return false;
}

const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? null;

// PostgreSQL session store (survives container restarts)
import pg from 'pg';
const sessionPool = new pg.Pool({
  connectionString: process.env.SESSIONS_DATABASE_URL
    || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website',
});

let sessionsTableReady = false;
async function ensureSessionsTable(): Promise<void> {
  if (sessionsTableReady) return;
  await sessionPool.query(`
    CREATE TABLE IF NOT EXISTS web_sessions (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  sessionsTableReady = true;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getLoginUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${SITE_URL}${CALLBACK_PATH}`,
    response_type: 'code',
    scope: 'openid email profile',
    ...(state ? { state } : {}),
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export async function getLogoutUrl(sessionId?: string): Promise<string> {
  if (sessionId) {
    try {
      await ensureSessionsTable();
      await sessionPool.query('DELETE FROM web_sessions WHERE id = $1', [sessionId]);
    } catch { /* best-effort cleanup */ }
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: SITE_URL,
  });
  return `${LOGOUT_ENDPOINT}?${params}`;
}

// 8 hours — session lifetime in the DB (independent of the short-lived access token)
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

async function refreshTokens(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    return { access_token: data.access_token, refresh_token: data.refresh_token || refreshToken, expires_in: data.expires_in || 300 };
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string): Promise<{ sessionId: string; user: UserSession } | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: `${SITE_URL}${CALLBACK_PATH}`,
    }),
  });

  if (!res.ok) {
    console.error('[auth] Token exchange failed:', res.status, await res.text());
    return null;
  }

  const tokens = await res.json();

  // Fetch user info
  const userRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    console.error('[auth] Userinfo failed:', userRes.status);
    return null;
  }

  const userInfo = await userRes.json();

  const sessionId = generateSessionId();
  const sessionExpiry = Date.now() + SESSION_TTL_MS;
  const user: UserSession = {
    sub: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
    preferred_username: userInfo.preferred_username,
    given_name: userInfo.given_name,
    family_name: userInfo.family_name,
    realmRoles: decodeRealmRoles(tokens.access_token),
    brand: BRAND,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: sessionExpiry,
  };

  await ensureSessionsTable();
  await sessionPool.query(
    'INSERT INTO web_sessions (id, data, expires_at) VALUES ($1, $2, $3)',
    [sessionId, JSON.stringify(user), new Date(sessionExpiry)]
  );
  return { sessionId, user };
}

const ADMIN_USERNAMES = new Set(
  (process.env.PORTAL_ADMIN_USERNAME || 'admin').split(',').map(s => s.trim()).filter(Boolean)
);

export function isAdmin(session: UserSession): boolean {
  return ADMIN_USERNAMES.has(session.preferred_username);
}

export async function getSession(cookieHeader: string | null): Promise<UserSession | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const sessionId = match[1];

  try {
    await ensureSessionsTable();
    const result = await sessionPool.query(
      'SELECT data FROM web_sessions WHERE id = $1 AND expires_at > NOW()',
      [sessionId]
    );

    if (result.rows.length === 0) return null;

    let session = result.rows[0].data as UserSession;

    // Refresh the Keycloak access token when its own JWT `exp` is within a
    // 60s safety buffer (KC default access-token TTL is 5 minutes), or when the
    // cached token lacks the arena audience (mapper added later) — otherwise
    // arena-server rejects the JWT with "exp claim timestamp check failed" or
    // an audience mismatch. session.expires_at tracks the web-session lifetime
    // (8h) and is unrelated to the access token's own expiry.
    const ACCESS_TOKEN_BUFFER_MS = 60 * 1000;
    const accessClaims = decodeJwtPayload(session.access_token);
    const accessExpMs = typeof accessClaims?.exp === 'number' ? accessClaims.exp * 1000 : 0;
    const accessExpired = accessExpMs - Date.now() < ACCESS_TOKEN_BUFFER_MS;
    const missingArenaAud = !tokenHasAudience(session.access_token, 'arena');
    const webSessionExpiring = session.expires_at - Date.now() < ACCESS_TOKEN_BUFFER_MS;
    if (accessExpired || missingArenaAud || webSessionExpiring) {
      const refreshed = await refreshTokens(session.refresh_token);
      if (refreshed) {
        const newExpiry = Date.now() + SESSION_TTL_MS;
        session = {
          ...session,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          realmRoles: decodeRealmRoles(refreshed.access_token),
          brand: BRAND,
          expires_at: newExpiry,
        };
        await sessionPool.query(
          'UPDATE web_sessions SET data = $1, expires_at = $2 WHERE id = $3',
          [JSON.stringify(session), new Date(newExpiry), sessionId]
        );
      } else {
        // Refresh failed — session is expired, clean up
        await sessionPool.query('DELETE FROM web_sessions WHERE id = $1', [sessionId]);
        return null;
      }
    }

    return session;
  } catch (err) {
    console.error('[auth] Session lookup failed:', err);
    return null;
  }
}

export function getSessionId(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1];
}

export function setSessionCookie(sessionId: string): string {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/**
 * Programmatically issue a web session for an arbitrary user payload and
 * return the cookie-bearing session id. Used by the magic-link redeem route
 * (system-test seeded users) — bypasses the normal OIDC code-flow.
 *
 * The caller is responsible for ensuring the user is genuinely entitled to a
 * session — this helper does not authenticate.
 */
export async function issueSession(user: UserSession): Promise<string> {
  await ensureSessionsTable();
  const sessionId = generateSessionId();
  await sessionPool.query(
    'INSERT INTO web_sessions (id, data, expires_at) VALUES ($1, $2, $3)',
    [sessionId, JSON.stringify(user), new Date(user.expires_at)],
  );
  return sessionId;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Clean up expired sessions every 15 minutes
setInterval(async () => {
  try {
    await ensureSessionsTable();
    await sessionPool.query('DELETE FROM web_sessions WHERE expires_at < NOW()');
  } catch { /* best-effort */ }
}, 15 * 60 * 1000);
