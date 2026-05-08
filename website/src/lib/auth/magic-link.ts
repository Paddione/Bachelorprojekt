// Homegrown magic-link mechanism for system-test seeded sessions.
//
// Why homegrown (not Keycloak action-tokens)?
//   - Keycloak's action-token API requires server-side trusted clients,
//     a custom token-action handler in the realm, and a redirect-URI allow-list
//     per client — none of which are configured here. The Keycloak helper in
//     `lib/keycloak.ts` already exposes only the bits we use (createUser,
//     deleteUser, role mappings, password-reset emails). Adding action-token
//     support would mean realm + client config drift across all environments.
//   - The session store in `lib/auth.ts` is a plain `web_sessions` JSONB
//     table keyed by an opaque session ID. We can write a minted session
//     directly into that table when a magic-link is redeemed, without going
//     through the OIDC code-flow. The seeded user's password is also known
//     to the admin (returned by the seed endpoint) so the test loop can fall
//     back to interactive password login if the magic-link is ever broken.
//
// Lifecycle:
//   - mintMagicLink() inserts a 32-byte random token + the seeded user's
//     identity (preferred_username, name, email) into `systemtest_magic_tokens`,
//     5-minute TTL.
//   - GET /api/auth/magic?token=...&to=... reads the row, verifies it's
//     unused & unexpired, marks `used_at`, mints a fresh `web_sessions` row
//     impersonating the test user, sets the workspace_session cookie, and
//     302s to `to`.
//   - Cleanup CronJob (Task 8) deletes purged-fixture user rows + their
//     remaining magic tokens.

import { pool } from '../website-db';
import type { UserSession } from '../auth';

const TOKEN_TTL_MS = 5 * 60 * 1000;

/** Encoded session-user payload stored alongside a magic token. We can't
 *  obtain real Keycloak tokens for a seeded test user without performing
 *  a password grant against Keycloak, so the magic redeem route fabricates
 *  an empty access/refresh-token pair. The session is short-lived (8h via
 *  SESSION_TTL_MS in lib/auth) and only used to drive the system test. */
export interface MagicSessionUser {
  sub: string;
  email: string;
  name: string;
  preferred_username: string;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface MintMagicLinkOpts {
  /** Keycloak user id (UUID). Stored for cleanup-side correlation. */
  keycloakUserId: string;
  sessionUser: MagicSessionUser;
  /** Path the magic redeem route 302s to after setting the cookie. */
  redirectUri: string;
  /** Optional override of the default 5-minute TTL. */
  ttlMs?: number;
}

export async function mintMagicLink(opts: MintMagicLinkOpts): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? TOKEN_TTL_MS));
  await pool.query(
    `INSERT INTO systemtest_magic_tokens
       (token, keycloak_user_id, session_user, redirect_uri, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)`,
    [token, opts.keycloakUserId, JSON.stringify(opts.sessionUser), opts.redirectUri, expiresAt],
  );
  const base = process.env.PUBLIC_URL ?? process.env.SITE_URL ?? '';
  return `${base}/api/auth/magic?token=${encodeURIComponent(token)}`;
}

export interface RedeemedToken {
  ok: true;
  user: UserSession;
  redirectUri: string;
}

export interface RedeemFailure {
  ok: false;
  reason: 'missing' | 'expired' | 'used' | 'unknown';
}

/** Atomically marks a token used and returns the session user it minted.
 *  Returns `{ ok: false }` if the token is missing/expired/already-used. */
export async function redeemMagicToken(token: string): Promise<RedeemedToken | RedeemFailure> {
  if (!token) return { ok: false, reason: 'missing' };
  const r = await pool.query(
    `UPDATE systemtest_magic_tokens
        SET used_at = now()
      WHERE token = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING keycloak_user_id, session_user, redirect_uri`,
    [token],
  );
  if (r.rows.length === 0) {
    // Distinguish expired/used vs. unknown for better UX. Look up the row
    // without the predicate to find out.
    const probe = await pool.query(
      `SELECT used_at, expires_at FROM systemtest_magic_tokens WHERE token = $1`,
      [token],
    );
    if (probe.rows.length === 0) return { ok: false, reason: 'unknown' };
    if (probe.rows[0].used_at) return { ok: false, reason: 'used' };
    return { ok: false, reason: 'expired' };
  }
  const row = r.rows[0];
  const sessionUser = row.session_user as MagicSessionUser;
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const user: UserSession = {
    sub: sessionUser.sub,
    email: sessionUser.email,
    name: sessionUser.name,
    preferred_username: sessionUser.preferred_username,
    // No real Keycloak tokens for seeded test sessions. The website's
    // refresh path in lib/auth will null out and force re-auth once these
    // empty strings hit Keycloak; for the system-test loop the session
    // lives only as long as the test (single attempt).
    access_token: '',
    refresh_token: '',
    expires_at: Date.now() + SESSION_TTL_MS,
  };
  return { ok: true, user, redirectUri: row.redirect_uri };
}
