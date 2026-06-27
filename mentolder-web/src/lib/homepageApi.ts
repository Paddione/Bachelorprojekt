// Cross-origin (same-site) client for the Astro website's auth + homepage APIs.
//
// react.<brand> is a static SPA with no backend of its own: it reuses the
// website's session + persistence by calling web.<brand> with credentials.
// The website origin is baked at build time via VITE_WEBSITE_ORIGIN (no brand
// literal in source). Empty origin falls back to same-origin relative URLs
// (used in tests / when proxied in dev).

const WEBSITE_ORIGIN = (import.meta.env.VITE_WEBSITE_ORIGIN ?? '').replace(/\/$/, '');

function apiUrl(path: string): string {
  return `${WEBSITE_ORIGIN}${path}`;
}

export interface AuthUser {
  name: string;
  email: string;
  username: string;
  givenName?: string;
  familyName?: string;
  isAdmin: boolean;
}

export interface MeResponse {
  authenticated: boolean;
  expiresAt?: number;
  user?: AuthUser;
}

export async function getMe(): Promise<MeResponse> {
  try {
    const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
    if (!res.ok) return { authenticated: false };
    return (await res.json()) as MeResponse;
  } catch {
    return { authenticated: false };
  }
}

export async function getHomepage<T = unknown>(): Promise<T | null> {
  try {
    const res = await fetch(apiUrl('/api/homepage'), { credentials: 'include' });
    if (res.status === 204 || !res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface SaveResult {
  ok: boolean;
  status: number;
  version?: number;
  errors?: Array<{ path: string; message: string }>;
  currentVersion?: number;
  currentValue?: unknown;
}

export async function saveHomepage(baseVersion: number, payload: unknown): Promise<SaveResult> {
  const res = await fetch(apiUrl('/api/admin/homepage/save'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseVersion, payload }),
  });
  const body = await res.json().catch(() => ({} as any));
  if (res.status === 200) return { ok: true, status: 200, version: body.version };
  if (res.status === 409) {
    return { ok: false, status: 409, currentVersion: body.currentVersion, currentValue: body.currentValue };
  }
  if (res.status === 422) return { ok: false, status: 422, errors: body.errors };
  return { ok: false, status: res.status };
}

export function loginUrl(returnTo: string): string {
  return apiUrl(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export function logoutUrl(returnTo: string): string {
  return apiUrl(`/api/auth/logout?returnTo=${encodeURIComponent(returnTo)}`);
}
