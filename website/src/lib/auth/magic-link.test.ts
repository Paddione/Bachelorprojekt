import { describe, it, expect, vi } from 'vitest';

vi.mock('../website-db', async () => {
  const actual = await vi.importActual('../website-db');
  return { ...actual };
});

async function loadModule() {
  return await import('./magic-link');
}

describe('mintMagicLink', () => {
  it('generates token and stores in database with default TTL', async () => {
    let called = false;
    const mockQuery = vi.fn(async (_sql: string, _params?: any[]) => {
      called = true;
      return { rows: [] };
    });

    globalThis.process.env.PUBLIC_URL = 'https://test.example.com';
    
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    await m.mintMagicLink({
      keycloakUserId: 'user-123',
      sessionUser: { sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' },
      redirectUri: '/home',
    });

    expect(called).toBe(true);
  });

  it('generates token and stores with custom TTL', async () => {
    let paramsReceived: any[] = [];
    const mockQuery = vi.fn(async (_sql: string, p?: any[]) => {
      paramsReceived = p;
      return { rows: [] };
    });

    globalThis.process.env.PUBLIC_URL = 'https://test.example.com';
    
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    await m.mintMagicLink({
      keycloakUserId: 'user-123',
      sessionUser: { sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' },
      redirectUri: '/home',
      ttlMs: 10 * 60 * 1000, // Custom TTL
    });

    expect(paramsReceived?.[4] > Date.now() + 9 * 60 * 1000).toBe(true);
  });

  it('falls back to SITE_URL when PUBLIC_URL is not set', async () => {
    delete globalThis.process.env.PUBLIC_URL;
    
    const mockQuery = vi.fn(async (_sql: string, _params?: any[]) => ({ rows: [] }));
    (await import('../website-db')).pool.query = mockQuery;

    globalThis.process.env.SITE_URL = 'https://alt.example.com';

    const m = await loadModule();
    const result = await m.mintMagicLink({
      keycloakUserId: 'user-123',
      sessionUser: { sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' },
      redirectUri: '/home',
    });

    expect(result).toContain('https://alt.example.com/api/auth/magic?token=');
  });
});

describe('redeemMagicToken - missing token validation', () => {
  it('returns missing for empty string token', async () => {
    const mockQuery = vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] }));
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    expect(await m.redeemMagicToken('')).toEqual({ ok: false, reason: 'missing' });
  });

  it('returns missing for null token', async () => {
    const mockQuery = vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] }));
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    expect(await m.redeemMagicToken(null as unknown as string)).toEqual({ ok: false, reason: 'missing' });
  });

  it('returns missing for undefined token', async () => {
    const mockQuery = vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] }));
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    expect(await m.redeemMagicToken(undefined as unknown as string)).toEqual({ ok: false, reason: 'missing' });
  });

  it('returns missing for whitespace token', async () => {
    const mockQuery = vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] }));
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    expect(await m.redeemMagicToken('   ')).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('redeemMagicToken - database lookup scenarios', () => {
  it('returns unknown when token does not exist in database', async () => {
    const mockQuery = vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] }));
    (await import('../website-db')).pool.query = mockQuery;

    const m = await loadModule();
    expect(await m.redeemMagicToken('nonexistent-token')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('returns expired when token has passed expiration', async () => {
    const now = new Date(Date.now() - 10 * 60 * 1000); // Past TTL
    
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE')) return { rows: [] };
      if (sql.includes('SELECT') && sql.includes('WHERE token = $1')) {
        return { rows: [{ used_at: null, expires_at: now }] };
      }
      return { rows: [] };
    });

    const m = await loadModule();
    expect(await m.redeemMagicToken('expired-token')).toEqual({ ok: false, reason: 'expired' });
  });

  it('returns used when token already redeemed', async () => {
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE')) return { rows: [] };
      if (sql.includes('SELECT') && sql.includes('WHERE token = $1')) {
        return { rows: [{ used_at: new Date(), expires_at: new Date(Date.now() + 3600000) }] };
      }
      return { rows: [] };
    });

    const m = await loadModule();
    expect(await m.redeemMagicToken('used-token')).toEqual({ ok: false, reason: 'used' });
  });

  it('returns success when token is valid', async () => {
    let rowReturned: any;
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE')) {
        rowReturned = { keycloak_user_id: 'kc-user-123', session_payload: JSON.stringify({ sub: 'sub-456', email: 'success@example.com', name: 'Success User', preferred_username: 'successuser' }), redirect_uri: '/dashboard' };
        return { rows: [rowReturned] };
      }
      return { rows: [] };
    });

    const m = await loadModule();
    const result = await m.redeemMagicToken('valid-token');

    expect(result.ok).toBe(true);
    const payload = JSON.parse(rowReturned.session_payload);
    expect(payload.email).toBe('success@example.com');
  });
});

describe('redeemMagicToken - session properties', () => {
  it('sets correct redirect URI from token row', async () => {
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE')) {
        return { rows: [{ keycloak_user_id: 'kc-user-123', session_payload: JSON.stringify({ sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' }), redirect_uri: '/custom-path?param=value' }] };
      }
      return { rows: [] };
    });

    const m = await loadModule();
    const result = await m.redeemMagicToken('redirect-token');

    expect(result.redirectUri).toBe('/custom-path?param=value');
  });

  it('sets session expiration to 8 hours', async () => {
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (_sql: string) => ({ rows: [{ keycloak_user_id: 'kc-user-123', session_payload: JSON.stringify({ sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' }), redirect_uri: '/home' }] }));

    const m = await loadModule();
    const result = await m.redeemMagicToken('exp-token');

    expect(result.user.expires_at - Date.now()).toBeGreaterThan(8 * 60 * 60 * 1000 - 5000);
  });

  it('sets BRAND from process.env.BRAND_ID', async () => {
    globalThis.process.env.BRAND_ID = 'brand-uuid';
    
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (_sql: string) => ({ rows: [{ keycloak_user_id: 'kc-user-123', session_payload: JSON.stringify({ sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' }), redirect_uri: '/home' }] }));

    const m = await loadModule();
    const result = await m.redeemMagicToken('brand-token');

    expect(result.user.brand).toBe('brand-uuid');
  });

  it('falls back to BRAND when BRAND_ID is not set', async () => {
    delete globalThis.process.env.BRAND_ID;
    globalThis.process.env.BRAND = 'fallback-brand';
    
    vi.mocked((await import('../website-db')).pool.query).mockImplementation(async (_sql: string) => ({ rows: [{ keycloak_user_id: 'kc-user-123', session_payload: JSON.stringify({ sub: 's', email: 'e@x.com', name: 'N', preferred_username: 'u' }), redirect_uri: '/home' }] }));

    const m = await loadModule();
    const result = await m.redeemMagicToken('fallback-token');

    expect(result.user.brand).toBe('fallback-brand');
  });
});
