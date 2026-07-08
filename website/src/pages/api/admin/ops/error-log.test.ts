import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSession } from '../../../../lib/auth';

let mockSession: UserSession | null = null;
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
  isAdmin: vi.fn((s: UserSession | null) => s?.realmRoles?.includes('admin') ?? false),
}));

const query = vi.fn();
const persistError = vi.fn();
vi.mock('../../../../lib/logging/error-log-store', () => ({
  persistError: (...a: unknown[]) => persistError(...a),
  getErrorLogPool: () => ({ query: (...a: unknown[]) => query(...a) }),
}));

import { GET, POST } from './error-log';

type RouteContext = Parameters<typeof GET>[0];

const adminSession = { sub: 'u-1', realmRoles: ['admin'] } as unknown as UserSession;

const getReq = (since = '24h') =>
  new Request(`https://web.example.test/api/admin/ops/error-log?since=${since}`, {
    headers: { Cookie: 'session=test' },
  });

const postReq = (body: unknown, contentType = 'application/json') =>
  new Request('https://web.example.test/api/admin/ops/error-log', {
    method: 'POST',
    headers: { 'Content-Type': contentType, Cookie: 'session=test' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mockSession = null;
  query.mockReset();
  persistError.mockReset();
});

describe('GET /api/admin/ops/error-log', () => {
  it('returns 401 when not an admin', async () => {
    const res = await GET({ request: getReq() } as unknown as RouteContext);
    expect(res.status).toBe(401);
  });

  it('returns 400 for an unsupported window', async () => {
    mockSession = adminSession;
    const res = await GET({ request: getReq('7d') } as unknown as RouteContext);
    expect(res.status).toBe(400);
  });

  it('returns errors within last 24h ordered by ts DESC', async () => {
    mockSession = adminSession;
    const now = new Date();
    const sinceDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, source: 'browser', message: 'Recent error', namespace: 'workspace', ts: now.toISOString() },
        { id: 2, source: 'pod', message: 'Older error', pod_name: 'app-1', ts: sinceDate.toISOString() },
      ],
    });

    const res = await GET({ request: getReq() } as unknown as RouteContext);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].message).toBe('Recent error');
    expect(data[1].message).toBe('Older error');
  });
});

describe('POST /api/admin/ops/error-log', () => {
  it('returns 401 when not an admin', async () => {
    const res = await POST({ request: postReq({ source: 'browser', message: 'test error' }) } as unknown as RouteContext);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid POST data', async () => {
    mockSession = adminSession;
    const res = await POST({ request: postReq({ source: 'invalid' }) } as unknown as RouteContext);
    expect(res.status).toBe(400);
  });

  it('persists browser errors on POST', async () => {
    mockSession = adminSession;
    const res = await POST({ request: postReq({ source: 'browser', message: 'TypeError: x' }) } as unknown as RouteContext);

    expect(res.status).toBe(200);
    expect(persistError).toHaveBeenCalledWith(expect.objectContaining({ source: 'browser', message: 'TypeError: x' }));
  });
});
