import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/k8s', () => ({
  createK8sClient: vi.fn(async () => ({
    patch: vi.fn(async () => ({ ok: true })),
  })),
}));
vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ preferred_username: 'gekko', realmRoles: ['admin'] })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/website-db', () => {
  const mockQuery = vi.fn()
    .mockResolvedValueOnce({ rows: [] })        // checkConcurrent → no existing action
    .mockResolvedValue({ rows: [{ id: 1 }] });  // INSERT + finishAction fallback
  return {
    pool: { query: mockQuery },
    platformPool: { query: mockQuery },
  };
});

import { POST as redeployWebsite } from '../../../src/pages/api/admin/ops/redeploy/website';

function makeReq(body: object, sessionCookie = 'session=ok'): Request {
  return new Request('http://test/api/admin/ops/redeploy/website', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Cookie': sessionCookie, 'Content-Type': 'application/json' },
  });
}

describe('POST /api/admin/ops/redeploy/website', () => {
  it('returns 200 + action_id on happy path', async () => {
    const res = await redeployWebsite({ request: makeReq({ cluster: 'mentolder' }) } as unknown as Parameters<typeof redeployWebsite>[0]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action_id).toBeDefined();
  });

  it('returns 400 for invalid cluster', async () => {
    const res = await redeployWebsite({ request: makeReq({ cluster: 'invalid' }) } as unknown as Parameters<typeof redeployWebsite>[0]);
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { getSession } = await import('../../../src/lib/auth');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await redeployWebsite({ request: makeReq({ cluster: 'mentolder' }) } as unknown as Parameters<typeof redeployWebsite>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    const { isAdmin } = await import('../../../src/lib/auth');
    vi.mocked(isAdmin).mockReturnValueOnce(false);
    const res = await redeployWebsite({ request: makeReq({ cluster: 'mentolder' }) } as unknown as Parameters<typeof redeployWebsite>[0]);
    expect(res.status).toBe(403);
  });
});
