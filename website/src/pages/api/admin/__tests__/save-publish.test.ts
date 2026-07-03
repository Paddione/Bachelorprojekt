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
vi.mock('../../../../lib/cors', () => ({
  corsHeaders: () => ({}),
  handlePreflight: () => new Response(null, { status: 204 }),
}));

// T001490 Task 10 — guard against accidental direct pg calls on the
// retired content tables. We mock pg.Pool globally; any save.ts route
// that imports a website-db helper which touches these tables will trip
// the spy.
const pgSpy = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));
vi.mock('pg', () => {
  function Pool(this: { query: ReturnType<typeof vi.fn>; connect: () => Promise<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> }) {
    this.query = pgSpy.poolQuery;
    this.connect = async () => ({ query: pgSpy.clientQuery, release: pgSpy.release });
  }
  return { default: { Pool } };
});

const BRAND = 'mentolder';
const ADMIN_COOKIE = 'workspace_session=test';

function req(body: unknown, contentType = 'application/json'): Request {
  return new Request('http://x/api/admin/faq/save', {
    method: 'POST',
    headers: { 'content-type': contentType, cookie: ADMIN_COOKIE },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const adminCtx = { requestLogger: { error: vi.fn() } };

beforeEach(() => {
  mocks.publishContent.mockReset();
  mocks.getSession.mockReset();
  mocks.isAdmin.mockReset();
  pgSpy.poolQuery.mockReset();
  pgSpy.clientQuery.mockReset();
  pgSpy.release.mockReset();
  mocks.getSession.mockResolvedValue({ email: 'admin@example.com', name: 'Admin' });
  mocks.isAdmin.mockReturnValue(true);
});

/** T001490 Task 10: assert no pg SQL string ever mentions the retired content tables. */
function assertNoRetiredTableWrites() {
  const seen: string[] = [];
  for (const m of [pgSpy.poolQuery, pgSpy.clientQuery]) {
    for (const call of m.mock.calls) {
      const sql = String(call[0] ?? '');
      seen.push(sql);
    }
  }
  const combined = seen.join('\n').toLowerCase();
  expect(combined).not.toMatch(/insert\s+into\s+homepage_block_documents/);
  expect(combined).not.toMatch(/insert\s+into\s+homepage_block_versions/);
  expect(combined).not.toMatch(/insert\s+into\s+site_settings[^_]/);
  expect(combined).not.toMatch(/update\s+site_settings[^_]/);
}

describe('admin save-publish flow (T001490 Task 7)', () => {
  it('homepage save publishes via PR and returns { sha, prNumber, prUrl }, not a DB version', async () => {
    mocks.publishContent.mockResolvedValue({
      ok: true,
      sha: 'NEW_SHA',
      prNumber: 7,
      prUrl: 'https://github.com/Paddione/Bachelorprojekt/pull/7',
    });
    const { POST } = await import('../homepage/save');
    const res = await POST({ request: req({ payload: { schemaVersion: 1, blocks: [] } }), locals: adminCtx } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sha).toBe('NEW_SHA');
    expect(body.prUrl).toMatch(/\/pull\//);
    expect(mocks.publishContent).toHaveBeenCalledTimes(1);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ brand: string; domain: string }];
    expect(arg.brand).toBe(BRAND);
    expect(arg.domain).toBe('homepage-blocks');
  });

  it('homepage save never writes to homepage_block_documents / homepage_block_versions (T001490 Task 10)', async () => {
    mocks.publishContent.mockResolvedValue({
      ok: true,
      sha: 'X', prNumber: 1, prUrl: 'https://x',
    });
    const { POST } = await import('../homepage/save');
    const res = await POST({ request: req({ payload: { schemaVersion: 1, blocks: [] } }), locals: adminCtx } as never);
    expect(res.status).toBe(200);
    assertNoRetiredTableWrites();
  });

  it('all content-save domains route through publishContent and never hit the retired DB tables (T001490 Task 10)', async () => {
    mocks.publishContent.mockResolvedValue({ ok: true, sha: 'X', prNumber: 1, prUrl: 'https://x' });
    const cases: Array<{ path: string; body: unknown }> = [
      { path: '../faq/save',       body: { payload: [{ question: 'q', answer: 'a' }] } },
      { path: '../kontakt/save',   body: { payload: { intro: 'i', sidebarTitle: 't', sidebarText: 'x', sidebarCta: 'c', showPhone: false } } },
      { path: '../stammdaten/save', body: { payload: { name: 'A', role: 'B', email: 'c@d', phone: '0', street: 's', zip: '0', city: 'C', ustId: 'D', website: 'w', avatarInitials: 'AB' } } },
      { path: '../footer/save',    body: { payload: { columns: [], copyright: '' } } },
    ];
    for (const c of cases) {
      const mod = await import(c.path) as { POST: (ctx: { request: Request; locals: unknown }) => Promise<Response> };
      const r = await mod.POST({ request: req(c.body), locals: adminCtx });
      expect(r.status).toBe(200);
    }
    assertNoRetiredTableWrites();
  });

  it('maps a 409 PublishResult to a 409 HTTP response with currentSha + currentValue', async () => {
    mocks.publishContent.mockResolvedValue({
      ok: false,
      status: 409,
      currentSha: 'SHA_LIVE',
      currentValue: { foo: 'bar' },
    });
    const { POST } = await import('../faq/save');
    const res = await POST({ request: req({ payload: [{ question: 'q', answer: 'a' }] }), locals: adminCtx } as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.currentSha).toBe('SHA_LIVE');
    expect(body.currentValue).toEqual({ foo: 'bar' });
  });

  it('maps a 422 PublishResult to a 422 HTTP response with errors[]', async () => {
    mocks.publishContent.mockResolvedValue({
      ok: false,
      status: 422,
      errors: ['hero.title: Required'],
    });
    const { POST } = await import('../kontakt/save');
    const res = await POST({ request: req({ payload: {} }), locals: adminCtx } as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors).toEqual(['hero.title: Required']);
  });

  it('returns 401 when the request has no admin session', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { POST } = await import('../footer/save');
    const res = await POST({ request: req({ payload: { columns: [], copyright: '' } }), locals: adminCtx } as never);
    expect(res.status).toBe(401);
    expect(mocks.publishContent).not.toHaveBeenCalled();
  });

  it('routes stammdaten save through publishContent with the stammdaten domain', async () => {
    mocks.publishContent.mockResolvedValue({
      ok: true,
      sha: 'X', prNumber: 1, prUrl: 'https://x',
    });
    const { POST } = await import('../stammdaten/save');
    const res = await POST({ request: req({ payload: { name: 'A', role: 'B', email: 'c@d', phone: '0', street: 's', zip: '0', city: 'C', ustId: 'D', website: 'w', avatarInitials: 'AB' } }), locals: adminCtx } as never);
    expect(res.status).toBe(200);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ domain: string }];
    expect(arg.domain).toBe('stammdaten');
  });

  it('routes seo save through publishContent after merging the per-page-key patch into the bundle', async () => {
    mocks.publishContent.mockResolvedValue({
      ok: true,
      sha: 'X', prNumber: 1, prUrl: 'https://x',
    });
    const seoMod = await import('../../../../lib/content-bundle');
    vi.spyOn(seoMod, 'bundleSeo').mockReturnValue({
      titles: { home: 'old' },
      descriptions: {},
      ogImages: {},
    });
    const { POST } = await import('../seo/save');
    const res = await POST({
      request: req({ pageKey: 'home', title: 'New Home Title' }),
      locals: adminCtx,
    } as never);
    expect(res.status).toBe(200);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ domain: string; payload: { titles: Record<string, string> } }];
    expect(arg.domain).toBe('seo');
    expect(arg.payload.titles.home).toBe('New Home Title');
  });
});
