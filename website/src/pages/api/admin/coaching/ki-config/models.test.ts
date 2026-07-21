import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../lib/coaching-ki-config-db', () => ({
  getKiProviderById: vi.fn(),
}));
vi.mock('../../../../../lib/website-db', () => ({
  pool: {},
}));
const { getProviderByNameMock } = vi.hoisted(() => ({
  getProviderByNameMock: vi.fn(),
}));
vi.mock('../../../../../lib/provider-config', () => ({
  getProviderByName: (...a: unknown[]) => getProviderByNameMock(...a),
}));
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getKiProviderById } from '../../../../../lib/coaching-ki-config-db';
import type { KiConfig } from '../../../../../lib/coaching-ki-config-db';
import { GET } from './models';

type RouteContext = Parameters<typeof GET>[0];
const call = (query: string) => {
  const url = new URL(`http://x/api/admin/coaching/ki-config/models${query}`);
  const request = new Request(url, { headers: { cookie: 's=1' } });
  return GET({ request, url } as unknown as RouteContext);
};
const adminSession = { preferred_username: 'admin', sub: 'a', email: 'a@x' } as unknown as Awaited<ReturnType<typeof getSession>>;
const mkConfig = (overrides: Partial<KiConfig> = {}): KiConfig =>
  ({
    id: 1,
    brand: 'mentolder',
    provider: 'local-lmstudio',
    isActive: false,
    modelName: null,
    displayName: 'LM Studio',
    createdAt: new Date(0),
    apiKey: null,
    apiEndpoint: 'http://localhost:1234/v1',
    temperature: 0.7,
    maxTokens: null,
    topP: null,
    systemPrompt: null,
    ...overrides,
  }) as KiConfig;

describe('GET /api/admin/coaching/ki-config/models', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns 401 when no session is present', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await call('?id=1');
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when session exists but user is not admin', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(false);

    const res = await call('?id=1');
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  it('returns models when config has apiEndpoint and probe succeeds', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(getKiProviderById).mockResolvedValue(mkConfig());
    getProviderByNameMock.mockResolvedValue({
      provider: 'local-lmstudio', modelId: 'qwen2.5-7b', baseUrl: 'http://localhost:1234/v1', apiKey: 'not-required',
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ id: 'qwen2.5-7b' }, { id: 'mistral-7b' }] }),
    });

    const res = await call('?id=1');
    expect(res.status).toBe(200);
    const result = (await res.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(true);
    expect(result.models).toEqual(['qwen2.5-7b', 'mistral-7b']);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:1234/v1/models', expect.any(Object));
  });

  it('returns not reachable when getKiProviderById resolves null', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(getKiProviderById).mockResolvedValue(null);

    const res = await call('?id=999');
    expect(res.status).toBe(200);
    const result = (await res.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns not reachable when the probe fetch rejects', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(getKiProviderById).mockResolvedValue(mkConfig({ apiEndpoint: 'http://localhost:9999/v1' }));
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await call('?id=1');
    expect(res.status).toBe(200);
    const result = (await res.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns not reachable when id is missing', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);

    const res = await call('');
    expect(res.status).toBe(200);
    const result = (await res.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
    expect(getKiProviderById).not.toHaveBeenCalled();
  });

  it('returns not reachable when id is a non-integer', async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(isAdmin).mockReturnValue(true);

    const res = await call('?id=abc');
    expect(res.status).toBe(200);
    const result = (await res.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });
});
