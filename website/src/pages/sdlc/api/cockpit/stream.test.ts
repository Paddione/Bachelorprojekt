import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock cockpit-listen-hub ----
let mockSubscriberCount = 0;
const mockSubscribe = vi.fn((_fn: (...args: unknown[]) => void) => {
  mockSubscriberCount++;
  return () => {
    mockSubscriberCount--;
  };
});

vi.mock('../../../../lib/sdlc/cockpit-listen-hub', () => ({
  subscribe: (fn: (...args: unknown[]) => void) => mockSubscribe(fn),
  subscriberCount: () => mockSubscriberCount,
}));

// ---- Mock auth ----
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) =>
    cookie === 'admin'
      ? { preferred_username: 'admin', realmRoles: ['admin'] }
      : null,
  ),
  isAdmin: vi.fn((s: { realmRoles?: string[] } | null) => s?.realmRoles?.includes('admin') ?? false),
}));

// vi.waitFor resolves immediately even when the condition is false in this
// environment (observed 2026-08-08) — poll with real timers instead.
async function pollUntil(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}

import { GET } from './stream';

describe('GET /sdlc/api/cockpit/stream (Task 5)', () => {
  beforeEach(() => {
    mockSubscriberCount = 0;
    mockSubscribe.mockClear();
  });

  it('rejects unauthenticated request with 401 and creates no subscription', async () => {
    const res = await GET({
      request: new Request('http://localhost/sdlc/api/cockpit/stream'),
    } as never);

    expect(res.status).toBe(401);
    await res.text(); // drain body
    // No subscription should have been created — the auth check fails first.
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockSubscriberCount).toBe(0);
  });

  it('rejects non-admin session with 401 and creates no subscription', async () => {
    const res = await GET({
      request: new Request('http://localhost/sdlc/api/cockpit/stream', {
        headers: { cookie: 'plain' },
      }),
    } as never);

    expect(res.status).toBe(401);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('returns 200 with content-type text/event-stream for admin session', async () => {
    const controller = new AbortController();
    const res = await GET({
      request: new Request('http://localhost/sdlc/api/cockpit/stream', {
        headers: { cookie: 'admin' },
        signal: controller.signal,
      }),
    } as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    // Cache control header for SSE
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');

    // A subscription should be active
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscriberCount).toBe(1);

    // Abort the request to trigger cleanup
    controller.abort();
    await pollUntil(() => mockSubscriberCount === 0);
    expect(mockSubscriberCount).toBe(0);
  });

  it('abort releases the subscription', async () => {
    const controller = new AbortController();
    await GET({
      request: new Request('http://localhost/sdlc/api/cockpit/stream', {
        headers: { cookie: 'admin' },
        signal: controller.signal,
      }),
    } as never);

    expect(mockSubscriberCount).toBe(1);

    controller.abort();
    await pollUntil(() => mockSubscriberCount === 0);
    expect(mockSubscriberCount).toBe(0);
  });
});
