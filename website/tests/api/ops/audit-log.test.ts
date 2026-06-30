import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ preferred_username: 'paddione', realmRoles: ['admin'] })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/website-db', () => {
  const q = vi.fn(async () => ({ rows: [
    { id: 5, actor: 'gekko', action: 'redeploy_website', target: 'mentolder', status: 'success', created_at: new Date() },
  ] }));
  return {
    pool: { query: q },
    platformPool: { query: q },
  };
});

import { GET } from '../../../src/pages/api/admin/ops/audit/log';

describe('GET /api/admin/ops/audit/log', () => {
  it('returns rows from admin_actions', async () => {
    const res = await GET({
      url: new URL('http://test/?action_filter=&limit=10'),
      request: new Request('http://test', { headers: { Cookie: 'session=ok' } })
    } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.actions[0].id).toBe(5);
  });

  it('returns 401 when no session', async () => {
    const { getSession } = await import('../../../src/lib/auth');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await GET({
      url: new URL('http://test/?action_filter=&limit=10'),
      request: new Request('http://test', { headers: { Cookie: 'session=ok' } })
    } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    const { isAdmin } = await import('../../../src/lib/auth');
    vi.mocked(isAdmin).mockReturnValueOnce(false);
    const res = await GET({
      url: new URL('http://test/?action_filter=&limit=10'),
      request: new Request('http://test', { headers: { Cookie: 'session=ok' } })
    } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(403);
  });
});
