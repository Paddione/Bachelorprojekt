import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_POCKET = process.env.POCKET_ID_FRONTEND_URL;
const ORIGINAL_INTERNAL = process.env.POCKET_ID_URL;
const ORIGINAL_SECRET = process.env.POCKET_ID_WEBSITE_SECRET;
const ORIGINAL_SITE = process.env.SITE_URL;
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.POCKET_ID_FRONTEND_URL = 'https://auth.example.com';
  process.env.POCKET_ID_URL = 'https://pocket-id.internal';
  process.env.POCKET_ID_WEBSITE_SECRET = 'secret-12345';
  process.env.SITE_URL = 'https://mentolder.de';
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_POCKET === undefined) delete process.env.POCKET_ID_FRONTEND_URL;
  else process.env.POCKET_ID_FRONTEND_URL = ORIGINAL_POCKET;
  if (ORIGINAL_INTERNAL === undefined) delete process.env.POCKET_ID_URL;
  else process.env.POCKET_ID_URL = ORIGINAL_INTERNAL;
  if (ORIGINAL_SECRET === undefined) delete process.env.POCKET_ID_WEBSITE_SECRET;
  else process.env.POCKET_ID_WEBSITE_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_SITE === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = ORIGINAL_SITE;
});

async function loadModule() {
  return import('./auth');
}

function makeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `x.${enc(payload)}.y`;
}

describe('getLoginUrl', () => {
  it('builds an OIDC authorize URL with the default state', async () => {
    const m = await loadModule();
    const url = m.getLoginUrl();
    expect(url).toContain('https://auth.example.com/authorize');
    expect(url).toContain('client_id=website');
    expect(url).toContain('response_type=code');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain(encodeURIComponent('/api/auth/callback'));
  });

  it('echoes the supplied state parameter', async () => {
    const m = await loadModule();
    const url = m.getLoginUrl('csrf-token-123');
    expect(url).toContain('state=csrf-token-123');
  });
});

describe('isAdmin', () => {
  it('returns true when realmRoles contains "admin"', async () => {
    const m = await loadModule();
    expect(m.isAdmin({ sub: 'u', email: 'a@b', name: 'A', preferred_username: 'a', realmRoles: ['admin'], brand: null, access_token: '', refresh_token: '', expires_at: 0 })).toBe(true);
  });

  it('returns false for empty realm roles', async () => {
    const m = await loadModule();
    expect(m.isAdmin({ sub: 'u', email: 'a@b', name: 'A', preferred_username: 'a', realmRoles: [], brand: null, access_token: '', refresh_token: '', expires_at: 0 })).toBe(false);
  });

  it('returns false for unknown roles', async () => {
    const m = await loadModule();
    expect(m.isAdmin({ sub: 'u', email: 'a@b', name: 'A', preferred_username: 'a', realmRoles: ['editor'], brand: null, access_token: '', refresh_token: '', expires_at: 0 })).toBe(false);
  });
});

describe('getSessionId / setSessionCookie / clearSessionCookie', () => {
  it('extracts the session id from a cookie header', async () => {
    const m = await loadModule();
    expect(m.getSessionId('workspace_session=abc-123; path=/')).toBe('abc-123');
    expect(m.getSessionId('foo=bar; workspace_session=xyz')).toBe('xyz');
  });

  it('returns undefined when no session cookie is present', async () => {
    const m = await loadModule();
    expect(m.getSessionId('foo=bar')).toBeUndefined();
    expect(m.getSessionId(null)).toBeUndefined();
  });

  it('builds a Set-Cookie header with HttpOnly + SameSite=Lax', async () => {
    const m = await loadModule();
    const out = m.setSessionCookie('sess-1');
    expect(out).toContain('workspace_session=sess-1');
    expect(out).toContain('HttpOnly');
    expect(out.toLowerCase()).toContain('samesite=lax');
  });

  it('clearSessionCookie expires the session cookie', async () => {
    const m = await loadModule();
    const out = m.clearSessionCookie();
    expect(out).toContain('workspace_session=');
    expect(out.toLowerCase()).toContain('max-age=0');
  });
});

describe('getSession (in-memory session lookup)', () => {
  it('returns null when no session id is present in the cookie', async () => {
    const m = await loadModule();
    expect(await m.getSession('foo=bar')).toBeNull();
    expect(await m.getSession(null)).toBeNull();
  });
});

describe('exchangeCode', () => {
  it('returns null when Pocket ID token endpoint returns a non-OK response', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.exchangeCode('code-123')).toBeNull();
    } finally {
      console.error = originalErr;
    }
  });

  it('propagates the network error when the token endpoint throws (no try/catch on the outer fetch)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const m = await loadModule();
    await expect(m.exchangeCode('code-123')).rejects.toThrow(/network down/);
  });

  it('returns null when userinfo endpoint returns a non-OK response', async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            access_token: 'x', refresh_token: 'r', expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;
    const m = await loadModule();
    const originalErr = console.error;
    console.error = () => undefined;
    try {
      expect(await m.exchangeCode('code-123')).toBeNull();
    } finally {
      console.error = originalErr;
    }
  });
});
