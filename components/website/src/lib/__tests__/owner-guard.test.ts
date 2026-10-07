import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSession } from '../auth';

// Negative control for the red step: fixtures drop the owner group and the
// session mock serves non-owner sessions, so every allow-path assertion
// below fails while deny-path assertions hold. Unset for the green run.
const NEGATIVE = process.env.WF_NEGATIVE_CONTROL === '1';

vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>();
  return { ...actual, getSession: vi.fn() };
});

import { getSession, decodeGroupsClaim } from '../auth';
import { isOwnerSession, requireOwner, ownerBusiness } from '../owner-guard';

const mockedGetSession = vi.mocked(getSession);

function session(overrides: Partial<UserSession> = {}): UserSession {
  return {
    sub: 'user-1',
    email: 'owner@example.test',
    name: 'Owner',
    preferred_username: 'owner',
    realmRoles: [],
    brand: 'brand-a',
    access_token: 'token',
    refresh_token: 'refresh',
    expires_at: Date.now() + 3600_000,
    ...overrides,
  };
}

function jwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.`;
}

beforeEach(() => {
  mockedGetSession.mockReset();
});

describe('isOwnerSession', () => {
  it('denies an absent session', () => {
    expect(isOwnerSession(null)).toBe(false);
  });

  it('denies a session without a groups claim', () => {
    expect(isOwnerSession(session({ groups: undefined }))).toBe(false);
  });

  it('denies a session with only a non-owner group', () => {
    expect(isOwnerSession(session({ groups: ['workspace-users'] }))).toBe(false);
  });

  it('allows a session carrying the owner group', () => {
    const groups = NEGATIVE ? ['workspace-users'] : ['owner'];
    expect(isOwnerSession(session({ groups }))).toBe(true);
  });
});

describe('requireOwner', () => {
  it('denies when no session exists', async () => {
    mockedGetSession.mockResolvedValue(null);
    await expect(requireOwner('workspace_session=missing')).resolves.toBeNull();
  });

  it('denies a session without a groups claim', async () => {
    mockedGetSession.mockResolvedValue(session({ groups: undefined }));
    await expect(requireOwner('workspace_session=x')).resolves.toBeNull();
  });

  it('denies a session with only a non-owner group', async () => {
    mockedGetSession.mockResolvedValue(session({ groups: ['workspace-users'] }));
    await expect(requireOwner('workspace_session=x')).resolves.toBeNull();
  });

  it('allows a session carrying the owner group', async () => {
    const groups = NEGATIVE ? ['workspace-users'] : ['owner'];
    const owned = session({ groups });
    mockedGetSession.mockResolvedValue(owned);
    await expect(requireOwner('workspace_session=x')).resolves.toBe(owned);
  });
});

describe('ownerBusiness', () => {
  it('binds the context to exactly the session brand', () => {
    expect(ownerBusiness(session({ brand: 'brand-a' }))).toEqual({ brand: 'brand-a' });
  });

  it('denies a foreign business: context never resolves to it', () => {
    const context = ownerBusiness(session({ brand: 'brand-a' }));
    expect(context.brand).not.toBe('brand-b');
  });
});

describe('decodeGroupsClaim', () => {
  it('reads the groups claim from the access token', () => {
    expect(decodeGroupsClaim(jwt({ groups: ['owner', 'team'] }))).toEqual(['owner', 'team']);
  });

  it('fails closed on a missing groups claim', () => {
    expect(decodeGroupsClaim(jwt({ sub: 'user-1' }))).toEqual([]);
  });

  it('fails closed on a non-array groups claim', () => {
    expect(decodeGroupsClaim(jwt({ groups: 'owner' }))).toEqual([]);
  });

  it('drops non-string entries instead of trusting them', () => {
    expect(decodeGroupsClaim(jwt({ groups: ['owner', 42] }))).toEqual(['owner']);
  });

  it('fails closed on a malformed token', () => {
    expect(decodeGroupsClaim('not-a-jwt')).toEqual([]);
  });
});
