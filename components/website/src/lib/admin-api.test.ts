import { describe, it, expect, vi, afterEach } from 'vitest';
import { toast, apiCall } from './admin-api';

describe('admin-api.toast', () => {
  const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;
  const ORIGINAL_LOCATION = (globalThis as { location?: unknown }).location;

  afterEach(() => {
    if (ORIGINAL_WINDOW === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = ORIGINAL_WINDOW;
    if (ORIGINAL_LOCATION === undefined) delete (globalThis as { location?: unknown }).location;
    else (globalThis as { location?: unknown }).location = ORIGINAL_LOCATION;
  });

  it('is a no-op when window is undefined (SSR)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => toast('ok', 'hi')).not.toThrow();
  });

  it('dispatches a CustomEvent with kind + message detail when window is available', () => {
    const seen: { type: string; detail: unknown }[] = [];
    (globalThis as { window: unknown }).window = {
      dispatchEvent: (ev: { type: string; detail: unknown }) => { seen.push(ev); return true; },
    };
    toast('err', 'kaputt');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'admin-toast', detail: { kind: 'err', message: 'kaputt' } });
  });
});

describe('admin-api.apiCall', () => {
  const ORIGINAL_FETCH = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete (globalThis as { window?: unknown }).window;
  });

  function stubWindow() {
    (globalThis as { window: unknown }).window = {
      location: { assign: vi.fn() },
      dispatchEvent: () => true,
    };
  }

  it('returns ok=true and parses JSON on 2xx', async () => {
    stubWindow();
    globalThis.fetch = (async () => new Response(JSON.stringify({ hello: 'world' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const out = await apiCall<{ hello: string }>('/api/x');
    expect(out).toEqual({ ok: true, data: { hello: 'world' } });
  });

  it('returns ok=false + toasts a warning for 4xx errors with a server message', async () => {
    stubWindow();
    const dispatched: { detail: unknown }[] = [];
    (globalThis as { window: unknown }).window = {
      location: { assign: vi.fn() },
      dispatchEvent: (ev: { detail: unknown }) => { dispatched.push(ev); return true; },
    };
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'bad request' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const out = await apiCall<unknown>('/api/x', {}, { retries: 0 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe('bad request');
      expect(out.status).toBe(400);
    }
    expect(dispatched.some(e => (e.detail as { kind: string }).kind === 'warn')).toBe(true);
  });

  it('returns ok=false and toasts an err for 5xx', async () => {
    stubWindow();
    const dispatched: { detail: unknown }[] = [];
    (globalThis as { window: unknown }).window = {
      location: { assign: vi.fn() },
      dispatchEvent: (ev: { detail: unknown }) => { dispatched.push(ev); return true; },
    };
    globalThis.fetch = (async () => new Response('oops', { status: 503 })) as typeof fetch;
    const out = await apiCall<unknown>('/api/x', {}, { retries: 0 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(503);
      expect(out.error).toMatch(/Fehler 503|oops/);
    }
    expect(dispatched.some(e => (e.detail as { kind: string }).kind === 'err')).toBe(true);
  });

  it('on 401, redirects to /login with the encoded return_to and returns ok=false', async () => {
    const assign = vi.fn();
    (globalThis as { window: unknown }).window = {
      location: { pathname: '/admin/cockpit', assign },
      dispatchEvent: () => true,
    };
    globalThis.fetch = (async () => new Response('unauth', { status: 401 })) as typeof fetch;
    const out = await apiCall<unknown>('/api/x', {}, { retries: 0 });
    expect(out.ok).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toMatch(/^\/login\?return_to=/);
    expect(decodeURIComponent(assign.mock.calls[0][0].split('return_to=')[1])).toBe('/admin/cockpit');
  });

  it('retries on network failure then surfaces the last error as err toast', async () => {
    stubWindow();
    const dispatched: { detail: unknown }[] = [];
    (globalThis as { window: unknown }).window = {
      location: { assign: vi.fn() },
      dispatchEvent: (ev: { detail: unknown }) => { dispatched.push(ev); return true; },
    };
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error('offline');
    }) as typeof fetch;
    const out = await apiCall<unknown>('/api/x', {}, { retries: 1, retryDelay: 0 });
    expect(out.ok).toBe(false);
    expect(calls).toBe(2);
    expect(dispatched.some(e => (e.detail as { kind: string; message: string }).kind === 'err'
      && (e.detail as { message: string }).message === 'offline')).toBe(true);
  });
});
