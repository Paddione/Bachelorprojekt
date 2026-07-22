import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (c: string | null) => (c === 'admin' ? { groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));
const listBackends = vi.fn();
vi.mock('../../../../lib/llm-proxy-db', () => ({ listBackends: (...a: unknown[]) => listBackends(...a) }));

import { GET } from './status';

const req = (c: string | null) =>
  new Request('http://x/api/admin/llm-proxy/status', { headers: c ? { cookie: c } : {} });
const call = (c: string | null) => GET({ request: req(c), locals: { requestLogger: { warn: vi.fn() } } } as unknown as Parameters<typeof GET>[0]);

beforeEach(() => { listBackends.mockReset(); vi.restoreAllMocks(); });

describe('GET /api/admin/llm-proxy/status', () => {
  it('401 ohne Admin', async () => {
    expect((await call(null)).status).toBe(401);
  });

  it('200 mit Upstream-Status, wenn der Proxy erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ backends: [{ name: 'a', healthy: true }] }), { status: 200 })));
    const res = await call('admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ proxy: expect.not.stringMatching(/offline/) });
  });

  it('200 proxy:offline + DB-Backends, wenn der Proxy nicht erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    listBackends.mockResolvedValueOnce([{ id: 1, name: 'a', enabled: true }]);
    const res = await call('admin');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proxy).toBe('offline');
    expect(body.backends).toEqual([{ id: 1, name: 'a', enabled: true }]);
  });
});
