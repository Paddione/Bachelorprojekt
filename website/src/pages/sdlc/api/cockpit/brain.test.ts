import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) => (cookie === 'admin' ? { preferred_username: 'admin', groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));

import { GET } from './brain';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function req(cookie: string | null, qs: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request(`http://x/sdlc/api/cockpit/brain?${qs}`, { headers });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('GET /sdlc/api/cockpit/brain', () => {
  it('403 without an admin session', async () => {
    const res = await GET({ request: req(null, 'paths=a.md') } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(403);
  });

  it('400 when paths is missing', async () => {
    const res = await GET({ request: req('admin', '') } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('reports error when the service does not answer at all (D13)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await GET({ request: req('admin', 'paths=CLAUDE.md') } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links).toEqual([]);
    expect(body.error).toBeTruthy();
  });

  it('emits a clean link when the candidate answers 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const res = await GET({ request: req('admin', 'paths=CLAUDE.md') } as unknown as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.links).toEqual([{ href: '/wiki/claude', label: 'CLAUDE' }]);
    expect(body.missing).toEqual([]);
  });

  it('routes a pruned source into uncovered instead of probing', async () => {
    const res = await GET({ request: req('admin', 'paths=website/src/pages/index.astro') } as unknown as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.uncovered).toEqual(['website/src/pages/index.astro']);
    expect(body.links).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing page when no candidate answers', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const res = await GET({ request: req('admin', 'paths=openspec/specs/sdlc-cockpit.md') } as unknown as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.links).toEqual([]);
    expect(body.missing).toEqual(['openspec-specs-sdlc-cockpit']);
  });
});
