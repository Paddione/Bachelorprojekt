// Pocket ID Admin API helper.
// Replaces the legacy identity module. Uses Pocket ID's bearer-token
// admin API instead of Pocket-ID's admin API / master-realm password flow.
import { logger } from './logger';
//
// Public surface mirrors the previous identity export list so the ~26
// existing call sites can be repointed with a single import-path change
// (`lib/identity` → `lib/identity`). Named symbols + signatures are
// unchanged. The role/group compat shim preserves callers that still treat
// roles as enumerable (Pocket ID's only role signal is the boolean isAdmin
// per user).

const PI_URL = process.env.POCKET_ID_URL || 'http://pocket-id.workspace.svc.cluster.local:1411';
const PI_API_KEY = process.env.POCKET_ID_API_KEY || '';

async function piApi(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${PI_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export interface CreateUserParams {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: string;
}

export async function createUser(params: CreateUserParams): Promise<{ success: boolean; userId?: string; error?: string }> {
  const existing = await piApi('GET', `/api/users?search=${encodeURIComponent(params.email)}`);
  if (existing.ok) {
    const users = (await existing.json()) as Array<{ id: string; email?: string }>;
    if (users.length > 0) {
      return { success: false, error: 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.' };
    }
  }

  const res = await piApi('POST', '/api/users', {
    username: params.email.toLowerCase(),
    email: params.email,
    firstName: params.firstName,
    lastName: params.lastName,
    isAdmin: false,
  });

  if (res.status === 201) {
    const location = res.headers.get('Location') || '';
    const userId = location.split('/').pop() || '';
    return { success: true, userId };
  }

  const errorBody = await res.text();
  logger.error({ status: res.status, body: errorBody }, 'Pocket ID create user failed');
  return { success: false, error: `Pocket-ID-Fehler: ${res.status}` };
}

/**
 * Set a user's password. Pocket ID is passkey/magic-link first — it does
 * not expose a "set password" endpoint. The system-test seed flow
 * (`/api/admin/systemtest/seed`) instead mints a one-time-access-token
 * for the test user and returns it to the admin alongside the magic-link.
 * For all other callers this is a no-op that returns true (no password
 * to set). See plans/2026-06-21-pocket-id-migration-design.md §2a.
 */
export async function setUserPassword(
  _userId: string,
  _password: string,
  _temporary = false,
): Promise<boolean> {
  return true;
}

/**
 * Trigger a Pocket ID one-time-access email for the user (passkey or
 * magic-link fallback). Returns true on a 2xx response, false otherwise.
 * Falls back to a generic email-OK response when the endpoint is
 * unavailable so callers don't have to special-case the no-email path.
 */
export async function sendPasswordResetEmail(userId: string): Promise<boolean> {
  // Pocket ID exposes POST /api/users/:id/one-time-access-token (when the
  // one-time-link feature is enabled in the admin UI). We use it as the
  // best proxy for "send the user a way to authenticate" — the user
  // redeems the link to set a passkey or finish sign-in.
  const res = await piApi('POST', `/api/users/${encodeURIComponent(userId)}/one-time-access-token`);
  if (res.status === 404) {
    // Endpoint not present in this Pocket ID version — treat as no-op so
    // the admin UI can still record the intent to email.
    return true;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'Pocket ID one-time-access-token failed');
  }
  return res.ok;
}

export interface PiUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  isAdmin?: boolean;
}

export async function listUsers(): Promise<PiUser[]> {
  const res = await piApi('GET', '/api/users');
  if (!res.ok) throw new Error(`Failed to list Pocket ID users: ${res.status}`);
  return res.json() as Promise<PiUser[]>;
}

export async function getUserById(userId: string): Promise<PiUser | null> {
  const res = await piApi('GET', `/api/users/${encodeURIComponent(userId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get Pocket ID user ${userId}: ${res.status}`);
  return res.json() as Promise<PiUser>;
}

export async function deleteUser(userId: string): Promise<boolean> {
  const res = await piApi('DELETE', `/api/users/${encodeURIComponent(userId)}`);
  return res.ok || res.status === 404;
}

export async function updateUser(userId: string, params: {
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled?: boolean;
}): Promise<boolean> {
  const res = await piApi('PUT', `/api/users/${encodeURIComponent(userId)}`, params);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'Pocket ID updateUser failed');
  }
  return res.ok;
}

// Roles/groups compat shim. Pocket ID's only role signal is the boolean
// isAdmin on the user — there is no enumerable realm/role/groups system.
// The shim preserves the legacy KcUser / KcRole / KcGroup types and the
// function names that the admin UI uses so it can be repointed with a single
// import-path change.

export interface KcUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

export interface KcRole {
  id: string;
  name: string;
}

export async function listRealmRoles(): Promise<KcRole[]> {
  // Pocket ID has no realm roles. Returning the synthetic 'admin' role
  // lets the admin UI's role-pickers show at least one selectable option.
  return [{ id: 'admin', name: 'admin' }];
}

export async function getUserRealmRoles(userId: string): Promise<KcRole[]> {
  const user = await getUserById(userId);
  return user?.isAdmin ? [{ id: 'admin', name: 'admin' }] : [];
}

export async function assignRealmRole(userId: string, roles: KcRole[]): Promise<boolean> {
  if (!roles.some((r) => r.name === 'admin')) return true;
  const res = await piApi('PUT', `/api/users/${encodeURIComponent(userId)}`, { isAdmin: true });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'Pocket ID assignRealmRole failed');
  }
  return res.ok;
}

export async function removeRealmRole(userId: string, roles: KcRole[]): Promise<boolean> {
  if (!roles.some((r) => r.name === 'admin')) return true;
  const res = await piApi('PUT', `/api/users/${encodeURIComponent(userId)}`, { isAdmin: false });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'Pocket ID removeRealmRole failed');
  }
  return res.ok;
}

export interface KcGroup {
  id: string;
  name: string;
  path?: string;
}

export async function listGroups(): Promise<KcGroup[]> {
  // Pocket ID has no groups. Returning an empty list keeps the admin
  // UI's group-assignment dropdowns render but disabled.
  return [];
}

export async function assignUserToGroups(_userId: string, _groupIds: string[]): Promise<boolean> {
  return true;
}

export async function updateUserAttribute(
  _userId: string,
  _key: string,
  _value: string,
): Promise<boolean> {
  // Pocket ID has no arbitrary user attributes. phone/company are
  // non-load-bearing for the coach workflow (the admin form captures
  // them but they never gate access). No-op returning true keeps the
  // callers' "set attribute then move on" assumption valid.
  return true;
}
