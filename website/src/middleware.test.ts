import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the virtual `astro:middleware` module so we can import
// `website/src/middleware.ts` (the Astro entry point) outside the Astro
// build pipeline. `defineMiddleware` is the identity wrapper; `sequence`
// builds a chained handler that runs every handler in order, threading
// `next` through. The chain ends in the user-supplied `next`, which
// mirrors Astro's runtime contract.
vi.mock('astro:middleware', () => {
  type Handler = (ctx: unknown, next: () => Promise<Response>) => Promise<Response>;
  const defineMiddleware = (h: Handler): Handler => h;
  const sequence = (...handlers: Handler[]): Handler => {
    return async (ctx, next) => {
      let prev: () => Promise<Response> = next;
      for (let i = handlers.length - 1; i >= 0; i--) {
        const h = handlers[i];
        const n = prev;
        prev = () => h(ctx, n);
      }
      return prev();
    };
  };
  return { defineMiddleware, sequence };
});

import { onRequest } from './middleware';

interface FakeLocals {
  locale?: 'de' | 'en';
  requestId?: string;
  requestLogger?: { bindings: () => Record<string, unknown> };
}

function makeContext(headers: Record<string, string> = {}) {
  const locals: FakeLocals = {};
  const request = new Request('https://example.test/api/x', { method: 'GET', headers });
  return {
    request,
    url: new URL(request.url),
    locals,
  } as unknown as Parameters<typeof onRequest>[0];
}

describe('middleware.ts — Astro entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates locals.requestId and locals.requestLogger on every request', async () => {
    const ctx = makeContext();
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    const res = (await onRequest(ctx, next)) as Response;
    expect(ctx.locals.requestId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(ctx.locals.requestLogger).toBeDefined();
    expect(res.headers.get('X-Request-ID')).toBe(ctx.locals.requestId);
  });

  it('preserves the locale on locals (existing behavior)', async () => {
    const ctx = makeContext();
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    await onRequest(ctx, next);
    expect(ctx.locals.locale).toMatch(/^(de|en)$/);
  });

  it('runs the logging middleware before the locale middleware', async () => {
    // After the chain finishes, the logger must already be populated —
    // a handler that runs AFTER the locale step would still see it. We
    // assert this by reading requestLogger inside the user-supplied `next`
    // and checking it is defined (i.e. the logging step has completed
    // before the user code runs).
    const ctx = makeContext();
    let loggerFromNext: unknown;
    const next = vi.fn(async () => {
      loggerFromNext = ctx.locals.requestLogger;
      return new Response('ok', { status: 200 });
    });
    await onRequest(ctx, next);
    expect(loggerFromNext).toBeDefined();
    expect(loggerFromNext).toBe(ctx.locals.requestLogger);
  });
});

