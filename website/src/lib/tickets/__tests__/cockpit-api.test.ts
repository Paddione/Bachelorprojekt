import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), isAdmin: vi.fn(),
  getPortfolio: vi.fn(),
}));
vi.mock('../../../lib/auth', () => ({ getSession: mocks.getSession, isAdmin: mocks.isAdmin }));
vi.mock('../../../lib/tickets/cockpit-db', () => ({ getPortfolio: mocks.getPortfolio }));

import { GET } from '../../../pages/api/admin/cockpit/portfolio';

const req = () => new Request('http://x/api/admin/cockpit/portfolio',
  { headers: { cookie: 'sid=1' } });

beforeEach(() => { vi.clearAllMocks(); process.env.BRAND_ID = 'mentolder'; });

describe('GET /cockpit/portfolio', () => {
  it('403 when not admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(false);
    const res = await GET({ request: req() } as any);
    expect(res.status).toBe(403);
  });
  it('returns PortfolioPayload for admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true);
    mocks.getPortfolio.mockResolvedValue({ products: [{ extId: 'p1', features: [] }] });
    const res = await GET({ request: req() } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].extId).toBe('p1');
    expect(mocks.getPortfolio).toHaveBeenCalledWith('mentolder');
  });
});
