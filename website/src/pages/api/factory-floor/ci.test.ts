import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(async (c: string | null) => (c === 'admin' ? { groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));
const getTicketDetail = vi.fn();
vi.mock('../../../lib/factory-floor', () => ({ getTicketDetail: (...a: unknown[]) => getTicketDetail(...a) }));
const fetchCiChecks = vi.fn();
vi.mock('../../../lib/factory-ci', () => ({ fetchCiChecks: (...a: unknown[]) => fetchCiChecks(...a) }));

import { GET } from './[extId]/ci';
const req = (c: string | null) => new Request('http://x/api/factory-floor/T1/ci', { headers: c ? { cookie: c } : {} });

describe('GET /api/factory-floor/[extId]/ci', () => {
  it('401 without admin', async () => {
    const res = await GET({ request: req(null), params: { extId: 'T1' } } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });
  it('200 with {checks, rollup:null} when ticket has no PR', async () => {
    getTicketDetail.mockResolvedValueOnce({ prNumber: null });
    const res = await GET({ request: req('admin'), params: { extId: 'T1' } } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prNumber: null, checks: [], rollup: null });
  });
  it('200 with checks when ticket has a PR', async () => {
    getTicketDetail.mockResolvedValueOnce({ prNumber: 42 });
    fetchCiChecks.mockResolvedValueOnce({ checks: [{ name: 'CI', status: 'completed', conclusion: 'success', url: 'u' }], rollup: 'success' });
    const res = await GET({ request: req('admin'), params: { extId: 'T1' } } as unknown as Parameters<typeof GET>[0]);
    expect(await res.json()).toMatchObject({ prNumber: 42, rollup: 'success' });
  });
});
