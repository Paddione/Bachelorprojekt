import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveAuthProvider,
  resolveEndpoints,
  resolveEndpointsSync,
  clearProviderCache,
  hasFallbackConfigured,
  AuthUnavailableError,
} from './provider';

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const originalEnv = process.env;

function setEnv(vars: Record<string, string | undefined>) {
  process.env = { ...originalEnv, ...vars };
}

function resetEnv() {
  process.env = { ...originalEnv };
}

beforeEach(() => {
  clearProviderCache();
  vi.resetAllMocks();
  resetEnv();
});

describe('hasFallbackConfigured', () => {
  it('returns false when fallback env vars are missing', () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    expect(hasFallbackConfigured()).toBe(false);
  });

  it('returns false when only one fallback var is set', () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
      POCKET_ID_FALLBACK_FRONTEND_URL: 'https://auth.example.net',
    });
    expect(hasFallbackConfigured()).toBe(false);
  });

  it('returns true when both fallback vars are set', () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
      POCKET_ID_FALLBACK_FRONTEND_URL: 'https://auth.example.net',
      POCKET_ID_FALLBACK_URL: 'https://auth.example.net',
    });
    expect(hasFallbackConfigured()).toBe(true);
  });
});

describe('resolveEndpointsSync', () => {
  it('returns primary endpoints when no cache', () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    const ep = resolveEndpointsSync();
    expect(ep.auth).toBe('http://auth.localhost/authorize');
    expect(ep.token).toBe('http://pocket-id:1411/api/oidc/token');
    expect(ep.userinfo).toBe('http://pocket-id:1411/api/oidc/userinfo');
    expect(ep.logout).toBe('http://auth.localhost/api/oidc/end-session');
  });

  it('returns cached fleet endpoints when cache is warm', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
      POCKET_ID_FALLBACK_FRONTEND_URL: 'https://auth.example.net',
      POCKET_ID_FALLBACK_URL: 'https://auth.example.net',
    });
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('primary down')).mockResolvedValueOnce({ ok: true } as Response);
    const provider = await resolveAuthProvider();
    expect(provider?.id).toBe('fleet');
    const ep = resolveEndpointsSync();
    expect(ep.auth).toBe('https://auth.example.net/authorize');
    expect(ep.token).toBe('https://auth.example.net/api/oidc/token');
  });
});

describe('resolveAuthProvider', () => {
  it('Fall 1 — fail-closed: both providers unreachable returns null', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
      POCKET_ID_FALLBACK_FRONTEND_URL: 'https://auth.example.net',
      POCKET_ID_FALLBACK_URL: 'https://auth.example.net',
    });
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));
    const provider = await resolveAuthProvider();
    expect(provider).toBeNull();
  });

  it('Fall 2 — primary down, fallback up returns fleet', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
      POCKET_ID_FALLBACK_FRONTEND_URL: 'https://auth.example.net',
      POCKET_ID_FALLBACK_URL: 'https://auth.example.net',
    });
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const provider = await resolveAuthProvider();
    expect(provider?.id).toBe('fleet');
    expect(provider?.frontendUrl).toBe('https://auth.example.net');
  });

  it('Fall 3 — primary up returns local', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    const provider = await resolveAuthProvider();
    expect(provider?.id).toBe('local');
    expect(provider?.frontendUrl).toBe('http://auth.localhost');
  });

  it('Fall 4 — no fallback configured: only probes primary', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    // Primary succeeds — never probes fallback
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    const provider = await resolveAuthProvider();
    expect(provider?.id).toBe('local');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://pocket-id:1411/api/oidc/.well-known/openid-configuration',
      expect.anything(),
    );
  });
});

describe('resolveEndpoints async', () => {
  it('throws AuthUnavailableError when no provider reachable', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    global.fetch = vi.fn().mockRejectedValue(new Error('down'));
    await expect(resolveEndpoints()).rejects.toThrow(AuthUnavailableError);
  });

  it('returns local endpoints when primary is up', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    const ep = await resolveEndpoints();
    expect(ep.auth).toBe('http://auth.localhost/authorize');
    expect(ep.token).toBe('http://pocket-id:1411/api/oidc/token');
  });
});

describe('provider cache', () => {
  it('caches result for TTL', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    await resolveAuthProvider();
    await resolveAuthProvider();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('clearProviderCache invalidates cache', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    await resolveAuthProvider();
    clearProviderCache();
    await resolveAuthProvider();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache on failure', async () => {
    setEnv({
      POCKET_ID_FRONTEND_URL: 'http://auth.localhost',
      POCKET_ID_URL: 'http://pocket-id:1411',
    });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ok: true } as Response);
    await resolveAuthProvider();
    clearProviderCache();
    await resolveAuthProvider();
    clearProviderCache();
    await resolveAuthProvider();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
