import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  publishContent: vi.fn(),
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock('../../../../lib/content-publish', () => ({
  publishContent: mocks.publishContent,
}));
vi.mock('../../../../lib/auth', () => ({
  getSession: mocks.getSession,
  isAdmin: mocks.isAdmin,
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
  return new Request('http://x/api/admin/angebote/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify(body),
  });
}

type Ctx = { request: Request; locals?: { requestLogger?: { error?: (...a: unknown[]) => void } } };
type SaveModule = { POST: (c: Ctx) => Promise<Response> };

describe('POST /api/admin/angebote/save — T001490 publish pipeline', () => {
  it('publishes services + leistungen via the bot-PR pipeline', async () => {
    asAdmin();
    const { POST } = await import('./save') as SaveModule;
    const card = {
      slug: 'coaching',
      title: 'Coaching',
      description: 'd',
      icon: '🧠',
      features: [],
      leistungCategoryId: 'fuehrungskraefte',
    };
    const r = await POST({ request: jsonReq({ services: [card], leistungen: [] }) });
    expect(r.status).toBe(200);
    // Two publish calls — services then leistungen
    expect(mocks.publishContent).toHaveBeenCalledTimes(2);
    const [firstArg, secondArg] = mocks.publishContent.mock.calls as Array<[{ domain: string; payload: unknown[] }]>;
    expect(firstArg[0].domain).toBe('services');
    expect(secondArg[0].domain).toBe('leistungen');
  });

  it('strips legacy price and pageContent.pricing before publish on linked cards', async () => {
    asAdmin();
    const { POST } = await import('./save') as SaveModule;
    const card = {
      slug: 'coaching',
      title: 'Coaching',
      description: 'd',
      icon: '🧠',
      features: [],
      price: '150 € / Stunde',
      leistungCategoryId: 'fuehrungskraefte',
      pageContent: {
        headline: 'H',
        pricing: [{ label: 'Einzelstunde', price: '150 €' }],
      },
    };
    const r = await POST({ request: jsonReq({ services: [card], leistungen: [] }) });
    expect(r.status).toBe(200);
    const [firstArg] = mocks.publishContent.mock.calls as Array<[{ payload: Array<{ price?: string; pageContent?: { headline?: string; pricing?: unknown } }> }]>;
    const published = firstArg[0].payload[0];
    expect(published.price).toBeUndefined();
    expect(published.pageContent?.pricing).toBeUndefined();
    expect(published.pageContent?.headline).toBe('H');
  });

  it('keeps price on cards with no catalog link (legacy path)', async () => {
    asAdmin();
    const { POST } = await import('./save') as SaveModule;
    const card = {
      slug: 'beratung',
      title: 'Beratung',
      description: 'd',
      icon: '💼',
      features: [],
      price: 'auf Anfrage',
    };
    const r = await POST({ request: jsonReq({ services: [card], leistungen: [] }) });
    expect(r.status).toBe(200);
    const [firstArg] = mocks.publishContent.mock.calls as Array<[{ payload: Array<{ price?: string }> }]>;
    expect(firstArg[0].payload[0].price).toBe('auf Anfrage');
  });

  it('returns 409 when the services publish hits a stale SHA', async () => {
    asAdmin();
    mocks.publishContent
      .mockResolvedValueOnce({ ok: false, status: 409, currentSha: 'SHA_NEW', currentValue: { hint: 'rebase' } });
    const { POST } = await import('./save') as SaveModule;
    const r = await POST({ request: jsonReq({ services: [{ slug: 'a', title: 'A', description: 'd', icon: 'i', features: [] }], leistungen: [] }) });
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.currentSha).toBe('SHA_NEW');
  });

  it('rejects non-admin with 401', async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.isAdmin.mockReturnValue(false);
    const { POST } = await import('./save') as SaveModule;
    const r = await POST({ request: jsonReq({ services: [], leistungen: [] }) });
    expect(r.status).toBe(401);
    expect(mocks.publishContent).not.toHaveBeenCalled();
  });
});
