import { describe, it, expect, vi } from 'vitest';

const createJobMock = vi.fn(async () => ({ metadata: { name: 'reindex-coaching-original-12345' } }));
vi.mock('../../../src/lib/k8s', () => ({
  createK8sClient: vi.fn(async () => ({ post: createJobMock })),
}));
vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ preferred_username: 'gekko', realmRoles: ['admin'] })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/website-db', () => {
  const mockQuery = vi.fn()
    .mockResolvedValueOnce({ rows: [] })    // checkConcurrent
    .mockResolvedValue({ rows: [{ id: 1 }] });  // INSERT + UPDATE
  return {
    pool: { query: mockQuery },
    platformPool: { query: mockQuery },
  };
});

import { POST } from '../../../src/pages/api/admin/ops/ai/reindex';

const adminReq = (body: unknown) => new Request('http://test', {
  method: 'POST', body: JSON.stringify(body),
  headers: { Cookie: 'session=ok', 'Content-Type': 'application/json' },
});

describe('POST /api/admin/ops/ai/reindex', () => {
  it('creates k8s Job for valid collection', async () => {
    const res = await POST({ request: adminReq({ collection: 'coaching-original' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(createJobMock).toHaveBeenCalled();
  });

  it('returns 400 for invalid collection name', async () => {
    const res = await POST({ request: adminReq({ collection: 'evil; DROP TABLE x' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { getSession } = await import('../../../src/lib/auth');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST({ request: adminReq({ collection: 'coaching-original' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    const { isAdmin } = await import('../../../src/lib/auth');
    vi.mocked(isAdmin).mockReturnValueOnce(false);
    const res = await POST({ request: adminReq({ collection: 'coaching-original' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
  });
});
