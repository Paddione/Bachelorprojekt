import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../lib/coaching-ki-config-db', () => ({
  setActiveProvider: vi.fn(),
}));
vi.mock('../../../../../lib/website-db', () => ({
  pool: {},
}));
import { getSession, isAdmin } from '../../../../../lib/auth';
import { setActiveProvider } from '../../../../../lib/coaching-ki-config-db';
import { PATCH } from './active';

type RouteContext = Parameters<typeof PATCH>[0];
const mkReq = (body: string) =>
  new Request('http://x/api/admin/coaching/ki-config/active', {
    method: 'PATCH',
    headers: { cookie: 's=1', 'content-type': 'application/json' },
    body,
  });
const call = (body: string) => PATCH({ request: mkReq(body) } as unknown as RouteContext);
const adminSession = { preferred_username: 'admin', sub: 'a', email: 'a@x' } as unknown as Awaited<ReturnType<typeof getSession>>;

describe('PATCH /api/admin/coaching/ki-config/active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BRAND = 'mentolder';
  });

  it('accepts a KI_CATALOG provider id', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(setActiveProvider).mockResolvedValue(undefined);

    const res = await call(JSON.stringify({ provider: 'local-lmstudio' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(setActiveProvider).toHaveBeenCalledWith(expect.anything(), 'mentolder', 'local-lmstudio');
  });

  it('accepts a custom_-prefixed provider', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(setActiveProvider).mockResolvedValue(undefined);

    const res = await call(JSON.stringify({ provider: 'custom_myllm' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 404 for an unknown provider', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);

    const res = await call(JSON.stringify({ provider: 'not-a-provider' }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Provider nicht gefunden');
    expect(setActiveProvider).not.toHaveBeenCalled();
  });

  it('returns 401 when no session is present', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await call(JSON.stringify({ provider: 'local-lmstudio' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is not admin', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(false);

    const res = await call(JSON.stringify({ provider: 'local-lmstudio' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when request body is invalid JSON', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);

    const res = await call('not json');
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid JSON');
  });
});
