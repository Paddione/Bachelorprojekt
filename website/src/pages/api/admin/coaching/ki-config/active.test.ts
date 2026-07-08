import { describe, it, expect, vi } from 'vitest';

describe('Active provider endpoint', () => {
  let mockSession: ReturnType<typeof vi.fn>;
  let mockSetActiveProvider: ReturnType<typeof vi.fn>;
  
  beforeEach(() => {
    mockSession = vi.fn();
    mockSetActiveProvider = vi.fn();
    
    vi.mock('../../../../../../lib/auth', async () => ({
      getSession: mockSession,
      isAdmin: (s: any) => s?.role === 'admin',
    }));
    
    vi.mock('../../../../../../lib/coaching-ki-config-db', () => ({
      setActiveProvider: mockSetActiveProvider,
    }));

    Object.defineProperty(global, 'process', {
      value: { ...global.process, env: { BRAND: 'mentolder' } },
      writable: true,
    });
  });

  it('accepts local-lmstudio (KI_CATALOG id)', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);
    
    const providerId = 'local-lmstudio';
    mockSetActiveProvider.mockResolvedValue(undefined);

    const response = await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: providerId }),
    });
    
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(mockSetActiveProvider).toHaveBeenCalledWith(expect.anything(), 'mentolder', providerId);
  });

  it('accepts custom_myllm provider', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);
    
    const providerId = 'custom_myllm';
    mockSetActiveProvider.mockResolvedValue(undefined);

    const response = await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: providerId }),
    });
    
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 400 for invalid provider', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);
    
    const response = await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'not-a-provider' }),
    });
    
    expect(response.status).toBe(404);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('Provider nicht gefunden');
  });

  it('returns 401 when no session is present', async () => {
    mockSession.mockResolvedValue(null as any);

    const response = await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local-lmstudio' }),
    });
    
    expect(response.status).toBe(401);
  });

  it('returns 403 when session is not admin', async () => {
    mockSession.mockResolvedValue({ role: 'user' } as any);

    const response = await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local-lmstudio' }),
    });
    
    expect(response.status).toBe(401); // isAdmin returns false, so 401 is returned early
  });

  it('returns 400 when request body is invalid JSON', async () => {
    mockSession.mockResolvedValue({ role: 'admin' } as any);

    const response = await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('Invalid JSON');
  });
});
