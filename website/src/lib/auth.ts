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
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// Simple in-memory session store. In production, use Redis or a database.
const sessions = new Map<string, UserSession>();

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

export function getLogoutUrl(sessionId?: string): string {
  // Clean up server session
  if (sessionId) sessions.delete(sessionId);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: SITE_URL,
  });
  return `${LOGOUT_ENDPOINT}?${params}`;
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
  const user: UserSession = {
    sub: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
    preferred_username: userInfo.preferred_username,
    given_name: userInfo.given_name,
    family_name: userInfo.family_name,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };

  sessions.set(sessionId, user);
  return { sessionId, user };
}

const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USER || 'admin';

export function isAdmin(session: UserSession): boolean {
  return session.preferred_username === ADMIN_USERNAME;
}

export function getSession(cookieHeader: string | null): UserSession | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const sessionId = match[1];
  const session = sessions.get(sessionId);

  if (!session) return null;

  // Check expiry (with 60s buffer)
  if (session.expires_at < Date.now() + 60000) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

export function getSessionId(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1];
}

export function setSessionCookie(sessionId: string): string {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
