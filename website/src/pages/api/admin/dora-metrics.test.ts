import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock('../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { GET } from './dora-metrics';

const mkReq = (w = '7d') =>
  new Request(`http://x/api/admin/dora-metrics?window=${w}`, { headers: { cookie: 's=1' } });
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('GET /api/admin/dora-metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when not admin', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(401);
  });

  it('returns DORA metrics for an admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    // first query = merges, second = bugs (order matches the route's Promise.all)
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [
        { ticket_id: 'A', type: 'feature', driver: 'factory', created_at: '2026-06-01T00:00:00Z', merged_at: '2026-06-01T10:00:00Z', pr_number: 1, reverted: false },
      ] })
      .mockResolvedValueOnce({ rows: [
        { ticket_id: 'BUG1', type: 'bug', driver: 'devflow', created_at: '2026-06-01T00:00:00Z', merged_at: '2026-06-01T04:00:00Z', pr_number: 2, reverted: false },
      ] });
    const res = await GET({ request: mkReq('30d'), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.deploymentFrequency.merges).toBe(1);
    expect(body.metrics.window).toBe('30d');
    expect(body.metrics.mttrHours.median).toBe(4);
    expect(body.metrics.changeFailureRate.isProxy).toBe(true);
  });

  it('returns 500 on a query failure (logged, not thrown)', async () => {
    vi.mocked(getSession).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    (pool.query as any).mockRejectedValue(new Error('db down'));
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(500);
    expect(locals.requestLogger.error).toHaveBeenCalled();
  });
});
