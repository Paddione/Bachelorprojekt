import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserSession } from '../../../lib/auth';

let mockSession: UserSession | null = null;
vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
  isAdmin: vi.fn((s: UserSession) => s?.realmRoles?.includes('admin') ?? false),
}));

import { GET, OPTIONS } from './me';

const REACT = 'https://react.example.test';
const EVIL = 'https://evil.example';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.REACT_APP_ORIGIN;
  process.env.REACT_APP_ORIGIN = REACT;
  mockSession = null;
});
afterEach(() => {
  if (saved === undefined) delete process.env.REACT_APP_ORIGIN;
  else process.env.REACT_APP_ORIGIN = saved;
});

const req = (origin: string | null, method = 'GET') =>
  new Request('https://web.example.test/api/auth/me', {
    method,
    headers: origin ? { Origin: origin } : {},
  });

describe('me OPTIONS preflight', () => {
  it('answers an allowlisted preflight with 204 + Allow-Origin', () => {
    const res = OPTIONS({ request: req(REACT, 'OPTIONS') } as any) as Response;
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('answers a foreign preflight with 204 but no Allow-Origin', () => {
    const res = OPTIONS({ request: req(EVIL, 'OPTIONS') } as any) as Response;
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('me GET', () => {
  it('includes CORS headers for an allowlisted origin when logged out', async () => {
    const res = await GET({ request: req(REACT) } as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('returns the user + isAdmin with CORS for an allowlisted origin', async () => {
    mockSession = {
      sub: 'u-1',
      name: 'Gerald',
      email: 'g@mentolder.de',
      preferred_username: 'gekko',
      given_name: 'Gerald',
      family_name: 'Korczewski',
      realmRoles: ['admin'],
      brand: null,
      access_token: 'tok',
      refresh_token: 'rtok',
      expires_at: 123,
    };
    const res = await GET({ request: req(REACT) } as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.isAdmin).toBe(true);
    expect(body.user.username).toBe('gekko');
  });

  it('emits NO Allow-Origin for a foreign origin (fail-closed)', async () => {
    const res = await GET({ request: req(EVIL) } as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
