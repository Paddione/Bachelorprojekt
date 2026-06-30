import { describe, it, expect, vi } from 'vitest';
import { loggingMiddleware } from './logging';

function makeContext(headers: Record<string, string> = {}) {
  const locals: Record<string, unknown> = {};
  return {
    request: new Request('https://example.test/api/x', { method: 'POST', headers }),
    locals,
  } as unknown as Parameters<typeof loggingMiddleware>[0];
}

describe('loggingMiddleware', () => {
  it('reuses an incoming X-Request-ID header', async () => {
    const ctx = makeContext({ 'X-Request-ID': 'incoming-123' });
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    const res = await loggingMiddleware(ctx, next);
    expect(ctx.locals.requestId).toBe('incoming-123');
    expect(res.headers.get('X-Request-ID')).toBe('incoming-123');
  });

  it('generates a 12-char id when the header is absent', async () => {
    const ctx = makeContext();
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    await loggingMiddleware(ctx, next);
    expect(ctx.locals.requestId).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it('exposes a request-scoped logger on locals', async () => {
    const ctx = makeContext({ 'X-Request-ID': 'req-1' });
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    await loggingMiddleware(ctx, next);
    expect(ctx.locals.requestLogger).toBeDefined();
    expect(ctx.locals.requestLogger.bindings()).toMatchObject({ requestId: 'req-1' });
  });
});
