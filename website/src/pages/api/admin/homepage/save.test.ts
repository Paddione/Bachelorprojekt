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

const REACT = 'https://react.example.test';

beforeEach(() => {
  mocks.publishContent.mockReset();
  mocks.getSession.mockReset();
  mocks.isAdmin.mockReset();
  mocks.getSession.mockResolvedValue({ email: 'g@mentolder.de', name: 'Gerald', realmRoles: ['admin'] });
  mocks.isAdmin.mockReturnValue(true);
  mocks.publishContent.mockResolvedValue({ ok: true, sha: 'NEW', prNumber: 1, prUrl: 'https://x' });
});

type Ctx = { request: Request; locals?: { requestLogger?: { error?: (...a: unknown[]) => void } } };
type SaveModule = { POST: (c: Ctx) => Promise<Response> };

const post = (body: unknown, origin: string | null = REACT) => {
  const req = new Request('https://web.example.test/api/admin/homepage/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
  return import('./save') as Promise<SaveModule>;
};

describe('POST /api/admin/homepage/save (T001490 publish pipeline)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.isAdmin.mockReturnValue(false);
    const { POST } = await post({ payload: { schemaVersion: 1, blocks: [] } });
    const res = await POST({
      request: new Request('https://web.example.test/api/admin/homepage/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { schemaVersion: 1, blocks: [] } }),
      }),
      locals: { requestLogger: { error: vi.fn() } },
    });
    expect(res.status).toBe(401);
    expect(mocks.publishContent).not.toHaveBeenCalled();
  });

  it('returns 200 with sha/prNumber/prUrl on a successful publish', async () => {
    mocks.publishContent.mockResolvedValueOnce({
      ok: true,
      sha: 'NEW_COMMIT',
      prNumber: 7,
      prUrl: 'https://github.com/Paddione/Bachelorprojekt/pull/7',
    });
    const { POST } = await import('./save') as unknown as SaveModule;
    const res = await POST({
      request: new Request('https://web.example.test/api/admin/homepage/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: REACT },
        body: JSON.stringify({ baseSha: 'OLD', payload: { schemaVersion: 1, blocks: [] } }),
      }),
      locals: { requestLogger: { error: vi.fn() } },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sha).toBe('NEW_COMMIT');
    expect(body.prNumber).toBe(7);
    expect(body.prUrl).toMatch(/\/pull\//);
    const [arg] = mocks.publishContent.mock.calls[0] as [{ brand: string; domain: string; baseSha: string; editor: string }];
    expect(arg.brand).toBe('mentolder');
    expect(arg.domain).toBe('homepage-blocks');
    expect(arg.baseSha).toBe('OLD');
    expect(arg.editor).toBe('g@mentolder.de');
  });

  it('returns 422 with errors[] on Zod fail-closed', async () => {
    mocks.publishContent.mockResolvedValueOnce({ ok: false, status: 422, errors: ['blocks.0.type: bad'] });
    const { POST } = await import('./save') as unknown as SaveModule;
    const res = await POST({
      request: new Request('https://web.example.test/api/admin/homepage/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { schemaVersion: 1, blocks: [] } }),
      }),
      locals: { requestLogger: { error: vi.fn() } },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors).toEqual(['blocks.0.type: bad']);
  });

  it('returns 409 with currentSha on blob-SHA conflict', async () => {
    mocks.publishContent.mockResolvedValueOnce({
      ok: false,
      status: 409,
      currentSha: 'SHA_LIVE',
      currentValue: { schemaVersion: 1, blocks: [] },
    });
    const { POST } = await import('./save') as unknown as SaveModule;
    const res = await POST({
      request: new Request('https://web.example.test/api/admin/homepage/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseSha: 'SHA_OLD', payload: { schemaVersion: 1, blocks: [] } }),
      }),
      locals: { requestLogger: { error: vi.fn() } },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.currentSha).toBe('SHA_LIVE');
    expect(body.currentValue).toEqual({ schemaVersion: 1, blocks: [] });
  });
});
