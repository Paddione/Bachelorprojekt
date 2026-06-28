import { describe, test, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('pg', () => ({
  Pool: class { query = queryMock; },
}));
vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../lib/auth';
let route: typeof import('./ai-quality');

beforeEach(async () => {
  queryMock.mockReset();
  vi.resetModules();
  route = await import('./ai-quality');
});

function req(): Request {
  return new Request('http://localhost/api/admin/ai-quality', { headers: { cookie: 'sid=x' } });
}

describe('GET /api/admin/ai-quality', () => {
  test('401 ohne Admin-Session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(isAdmin).mockReturnValue(false);
    const res = await route.GET({ request: req() } as any);
    expect(res.status).toBe(401);
  });

  test('200 mit vollständigem Response-Shape', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'admin' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    queryMock.mockResolvedValue({ rows: [] });
    const res = await route.GET({ request: req() } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('health');
    expect(body).toHaveProperty('last24h');
    expect(body).toHaveProperty('byWorkflow');
    expect(body).toHaveProperty('recentErrors');
    expect(Array.isArray(body.last24h)).toBe(true);
    expect(Array.isArray(body.byWorkflow)).toBe(true);
    expect(Array.isArray(body.recentErrors)).toBe(true);
  });

  test('Health-Klassifikation: green bei niedriger Latenz/Fehlerrate', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'admin' } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    expect(route.computeHealth({ avg_latency_ms: 300, error_rate: 0.01, calls: 10 })).toBe('green');
    expect(route.computeHealth({ avg_latency_ms: 1500, error_rate: 0.1, calls: 10 })).toBe('yellow');
    expect(route.computeHealth({ avg_latency_ms: 5000, error_rate: 0.5, calls: 10 })).toBe('red');
    expect(route.computeHealth({ avg_latency_ms: 0, error_rate: 0, calls: 0 })).toBe('yellow');
  });
});
