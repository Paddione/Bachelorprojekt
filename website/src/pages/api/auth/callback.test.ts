import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth module so the callback's returnTo/redirect logic can be
// exercised without OIDC token exchange or a session DB.
let mockIsAdmin = true;
vi.mock('../../../lib/auth', () => ({
  exchangeCode: vi.fn(async () => ({
    sessionId: 'sess-123',
    user: { preferred_username: 'gekko', realmRoles: ['admin'], email: 'g@mentolder.de' },
  })),
  isAdmin: vi.fn(() => mockIsAdmin),
  setSessionCookie: vi.fn(() => 'workspace_session=sess-123; Path=/; HttpOnly; SameSite=Lax'),
}));

import { GET } from './callback';

const REACT = 'https://react.example.test';
const SITE = 'https://web.example.test';

let savedReact: string | undefined;
let savedSite: string | undefined;

beforeEach(() => {
  savedReact = process.env.REACT_APP_ORIGIN;
  savedSite = process.env.SITE_URL;
  process.env.REACT_APP_ORIGIN = REACT;
  process.env.SITE_URL = SITE;
  mockIsAdmin = true;
});
afterEach(() => {
  process.env.REACT_APP_ORIGIN = savedReact;
  process.env.SITE_URL = savedSite;
});

function call(state: string | null, code = 'abc') {
  const u = new URL(`${SITE}/api/auth/callback`);
  if (code !== '') u.searchParams.set('code', code);
  if (state !== null) u.searchParams.set('state', state);
  const ctx = { url: u, locals: { requestLogger: { error: vi.fn() } } };
  return GET(ctx as unknown as Parameters<typeof GET>[0]);
}

describe('callback returnTo allowlist', () => {
  it('redirects to a safe relative path unchanged', async () => {
    const res = await call('/portal/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/portal/dashboard');
  });

  it('redirects to an allowlisted React absolute URL', async () => {
    const res = await call(`${REACT}/admin/homepage`);
    expect(res.headers.get('Location')).toBe(`${REACT}/admin/homepage`);
  });

  it('redirects to an allowlisted SITE_URL absolute URL', async () => {
    const res = await call(`${SITE}/admin/content`);
    expect(res.headers.get('Location')).toBe(`${SITE}/admin/content`);
  });

  it('rejects a foreign absolute URL → admin fallback', async () => {
    const res = await call('https://evil.example/admin/homepage');
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('rejects a foreign absolute URL → portal fallback for non-admins', async () => {
    mockIsAdmin = false;
    const res = await call('https://evil.example/');
    expect(res.headers.get('Location')).toBe('/portal');
  });

  it('rejects a protocol-relative URL (//evil.com)', async () => {
    const res = await call('//evil.com/path');
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('rejects a backslash-authority path (/\\evil.com) — browsers normalize \\ to /', async () => {
    const res = await call('/\\evil.com');
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('rejects /\\/evil.com', async () => {
    const res = await call('/\\/evil.com');
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('rejects a returnTo whose host matches the allowlist but scheme is javascript:', async () => {
    const res = await call('javascript:alert(1)//react.example.test');
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('still sets the session cookie on redirect', async () => {
    const res = await call(`${REACT}/admin/homepage`);
    expect(res.headers.get('Set-Cookie')).toContain('workspace_session=');
  });
});
