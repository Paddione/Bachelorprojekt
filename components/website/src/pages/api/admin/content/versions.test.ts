import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock('../../../../lib/website-db', () => ({ listVersions: vi.fn() }));

import { getSession, isAdmin } from '../../../../lib/auth';
import { listVersions } from '../../../../lib/website-db';
import { GET } from './versions';

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(listVersions).mockReset();
});

describe('GET /api/admin/content/versions', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const url = new URL('http://x/api/admin/content/versions?key=kontakt');
    const res = await GET({ request: new Request(url), url } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns list of versions with id, editor, createdAt (no snapshot)', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' } } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    const mockVersions = [
      { id: 3, editor: 'admin@x.de', createdAt: new Date('2026-01-01'), snapshot: { value: { secret: 'stuff' } } },
      { id: 2, editor: 'admin@x.de', createdAt: new Date('2025-12-31'), snapshot: { value: { old: 'data' } } },
    ];
    vi.mocked(listVersions).mockResolvedValue(mockVersions as never);
    const url = new URL('http://x/api/admin/content/versions?key=kontakt');
    const res = await GET({ request: new Request(url), url } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty('id', 3);
    expect(body[0]).toHaveProperty('editor', 'admin@x.de');
    expect(body[0]).toHaveProperty('createdAt');
    expect(body[0]).not.toHaveProperty('snapshot'); // snapshot omitted from list
  });

  it('returns 400 when key param missing', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' } } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    const url = new URL('http://x/api/admin/content/versions');
    const res = await GET({ request: new Request(url), url } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
  });
});
