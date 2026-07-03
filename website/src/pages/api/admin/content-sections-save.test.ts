import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  publishContent: vi.fn(),
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock('../../../lib/content-publish', () => ({
  publishContent: mocks.publishContent,
}));
vi.mock('../../../lib/auth', () => ({
  getSession: mocks.getSession,
  isAdmin: mocks.isAdmin,
}));
vi.mock('../../../lib/cors', () => ({
  corsHeaders: () => ({}),
  handlePreflight: () => new Response(null, { status: 204 }),
}));

const OK = { ok: true as const, sha: 'NEW', prNumber: 1, prUrl: 'https://github.com/x/pull/1' };

beforeEach(() => {
  mocks.publishContent.mockReset();
  mocks.getSession.mockReset();
  mocks.isAdmin.mockReset();
  mocks.publishContent.mockResolvedValue(OK);
});

function asAdmin() {
  mocks.getSession.mockResolvedValue({ user: { sub: 'admin' }, email: 'admin@x' });
  mocks.isAdmin.mockReturnValue(true);
}

function jsonReq(body: unknown): Request {
  return new Request('http://x/api/admin/x/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify(body),
  });
}

type Ctx = { request: Request; locals?: { requestLogger?: { error?: (...a: unknown[]) => void } } };
type SaveModule = { POST: (c: Ctx) => Promise<Response> };

describe('content-section save endpoints (T001490 publish pipeline)', () => {
  it('navigation/save publishes with domain=navigation', async () => {
    asAdmin();
    const { POST } = await import('./navigation/save') as SaveModule;
    const nav = [{ label: 'Leistungen', href: '/leistungen', order: 1 }];
    const r = await POST({ request: jsonReq(nav) });
    expect(r.status).toBe(200);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ brand: string; domain: string; payload: unknown }];
    expect(arg.brand).toBe('mentolder');
    expect(arg.domain).toBe('navigation');
    expect(arg.payload).toEqual(nav);
  });

  it('footer/save publishes with domain=footer and copyright', async () => {
    asAdmin();
    const { POST } = await import('./footer/save') as SaveModule;
    const footer = { columns: [{ heading: 'Mehr', links: [{ label: 'Blog', href: '/blog' }] }], copyright: '© 2026' };
    const r = await POST({ request: jsonReq(footer) });
    expect(r.status).toBe(200);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ brand: string; domain: string; payload: typeof footer }];
    expect(arg.domain).toBe('footer');
    expect(arg.payload).toEqual(footer);
  });

  it('stammdaten/save publishes with domain=stammdaten', async () => {
    asAdmin();
    const { POST } = await import('./stammdaten/save') as SaveModule;
    const sd = { name: 'P', role: 'Coach', email: 'a@b.de', phone: '', street: '', zip: '', city: 'Berlin', ustId: '', website: '', avatarInitials: 'P' };
    const r = await POST({ request: jsonReq(sd) });
    expect(r.status).toBe(200);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ brand: string; domain: string }];
    expect(arg.domain).toBe('stammdaten');
  });

  it('kore-flags/save publishes with domain=kore-flags', async () => {
    asAdmin();
    const { POST } = await import('./kore-flags/save') as SaveModule;
    const r = await POST({ request: jsonReq({ timeline: 1 }) });
    expect(r.status).toBe(200);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ domain: string; payload: { timeline: number } }];
    expect(arg.domain).toBe('kore-flags');
    expect(arg.payload.timeline).toBe(1);
  });

  it('rejects non-admin with 401 and never publishes', async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.isAdmin.mockReturnValue(false);
    const { POST } = await import('./navigation/save') as SaveModule;
    const r = await POST({ request: jsonReq([]) });
    expect(r.status).toBe(401);
    expect(mocks.publishContent).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    asAdmin();
    const { POST } = await import('./navigation/save') as SaveModule;
    const req = new Request('http://x/api/admin/navigation/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: '{not-json',
    });
    const r = await POST({ request: req });
    expect(r.status).toBe(400);
    expect(mocks.publishContent).not.toHaveBeenCalled();
  });

  it('maps publish 422 to HTTP 422', async () => {
    asAdmin();
    mocks.publishContent.mockResolvedValueOnce({ ok: false, status: 422, errors: ['bad'] });
    const { POST } = await import('./navigation/save') as SaveModule;
    const r = await POST({ request: jsonReq([{ label: 'L', href: '/', order: 1 }]) });
    expect(r.status).toBe(422);
  });
});
