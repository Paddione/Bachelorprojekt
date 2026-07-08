import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Models endpoint', () => {
  let mockSession: ReturnType<typeof vi.fn>;
  let mockGetKiProviderById: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSession = vi.fn();
    mockGetKiProviderById = vi.fn();
    mockFetch = vi.fn();

    // Setup mocks inline
    vi.mock('../../../../../lib/auth', async () => ({
      getSession: mockSession,
      isAdmin: (s: any) => s?.role === 'admin',
    }));
    
    vi.mock('../../../../../lib/coaching-ki-config-db', () => ({
      getKiProviderById: mockGetKiProviderById,
    }));

    Object.defineProperty(global, 'fetch', { value: mockFetch, writable: true });
  });

  it('returns 401 when no session is present', async () => {
    mockSession.mockResolvedValue(null);

    const response = await fetch('/api/admin/coaching/ki-config/models?id=1');
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when session exists but user is not admin', async () => {
    mockSession.mockResolvedValue({ role: 'user' } as any);

    const response = await fetch('/api/admin/coaching/ki-config/models?id=1');
    expect(response.status).toBe(403);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  it('returns models when config has apiEndpoint and fetch succeeds', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);
    
    const mockConfig = {
      provider: 'local-lmstudio',
      modelName: null,
      apiEndpoint: 'http://localhost:1234/v1',
      apiKey: null,
      temperature: 0.7,
      maxTokens: null,
      topP: null,
      systemPrompt: null,
      isActive: false,
    };
    
    mockGetKiProviderById.mockResolvedValue(mockConfig);
    
    const modelResponse = { data: [{ id: 'qwen2.5-7b' }, { id: 'mistral-7b' }] };
    mockFetch.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(modelResponse) });

    const response = await fetch(`/api/admin/coaching/ki-config/models?id=1`);
    
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(true);
    expect(result.models).toEqual(['qwen2.5-7b', 'mistral-7b']);
  });

  it('returns not reachable when getKiProviderById resolves null', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);
    
    mockGetKiProviderById.mockResolvedValue(null);

    const response = await fetch('/api/admin/coaching/ki-config/models?id=999');
    
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns not reachable when fetch rejects', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);
    
    const mockConfig = {
      provider: 'local-lmstudio',
      modelName: null,
      apiEndpoint: 'http://localhost:9999/v1',
      apiKey: null,
      temperature: 0.7,
      maxTokens: null,
      topP: null,
      systemPrompt: null,
      isActive: false,
    };

    mockGetKiProviderById.mockResolvedValue(mockConfig);
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const response = await fetch('/api/admin/coaching/ki-config/models?id=1');
    
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns not reachable when id is missing or non-numeric', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);

    const response = await fetch('/api/admin/coaching/ki-config/models');
    
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns not reachable when id is a non-integer', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);

    const response = await fetch('/api/admin/coaching/ki-config/models?id=abc');
    
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reachable: boolean; models: string[] };
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });
});
