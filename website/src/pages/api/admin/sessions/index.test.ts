import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './index';

const mkReq = () => new Request('http://x/api/admin/sessions', { headers: { cookie: 's=1' } });
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('GET /api/admin/sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when anonymous', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(401);
  });

  it('403 when non-admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ preferred_username: 'bob', sub: 'b', email: 'b@x' } as any);
    vi.mocked(isAdmin).mockReturnValue(false);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(403);
  });

  it('returns sessions from the registry for an admin', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-'));
    const reg = join(dir, 'active-sessions.json');
    writeFileSync(reg, JSON.stringify([
      { slug: 'foo', type: 'form', title: 'Foo', port: 1, public_url: 'https://session-foo.dev.example.test', local_url: 'http://localhost:1/', started_at: '2026-06-20T00:00:00Z' },
    ]));
    process.env.SESSION_HUB_REGISTRY = reg;
    vi.mocked(getSession).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions[0].slug).toBe('foo');
  });

  it('returns an empty list when the registry file is absent', async () => {
    process.env.SESSION_HUB_REGISTRY = join(tmpdir(), 'does-not-exist-' + Date.now() + '.json');
    vi.mocked(getSession).mockResolvedValue({ preferred_username: 'admin', sub: 'a', email: 'a@x' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });
});
