import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (c: string | null) => {
    if (c === 'admin') return { sub: 'u1', groups: ['admins'] };
    if (c === 'user') return { sub: 'u2', groups: ['users'] };
    return null;
  }),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));

const readFactoryDefault = vi.fn();
const writeFactoryDefault = vi.fn();
vi.mock('../../../../lib/sdlc/llm-proxy-factory', () => ({
  FactoryProxyOfflineError: class FactoryProxyOfflineError extends Error {
    constructor() { super('llm-proxy nicht erreichbar'); this.name = 'FactoryProxyOfflineError'; }
  },
  FactoryWriteConflictError: class FactoryWriteConflictError extends Error {
    constructor() { super('Factory-Default wurde zwischenzeitlich geändert'); this.name = 'FactoryWriteConflictError'; }
  },
  readFactoryDefault: (...a: unknown[]) => readFactoryDefault(...a),
  writeFactoryDefault: (...a: unknown[]) => writeFactoryDefault(...a),
}));

import { GET, PUT } from './factory';

const req = (cookie: string | null, init?: RequestInit) =>
  new Request('http://x/sdlc/api/llm-proxy/factory', {
    headers: cookie ? { cookie } : {},
    ...init,
  });
const locals = { requestLogger: { warn: vi.fn(), error: vi.fn() } };
const call = (c: string | null, init?: RequestInit) =>
  ({ request: req(c, init), locals } as unknown as Parameters<typeof GET>[0]);

beforeEach(() => {
  readFactoryDefault.mockReset();
  writeFactoryDefault.mockReset();
});

describe('GET /sdlc/api/llm-proxy/factory', () => {
  it('401 ohne Session', async () => {
    const res = await GET(call(null));
    expect(res.status).toBe(401);
  });

  it('403 ohne Admin-Rolle', async () => {
    const res = await GET(call('user'));
    expect(res.status).toBe(403);
  });

  it('reicht model, locked, mtimeMs und selectable durch', async () => {
    readFactoryDefault.mockResolvedValueOnce({
      model: 'gemma26-throughput',
      locked: false,
      mtimeMs: 1724300000000,
      selectable: [{ slug: 'gemma26-throughput', label: 'Gemma 26B', port: 8092 }],
    });
    const res = await GET(call('admin'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      model: 'gemma26-throughput',
      locked: false,
      mtimeMs: 1724300000000,
      selectable: [{ slug: 'gemma26-throughput', label: 'Gemma 26B', port: 8092 }],
    });
  });

  it('nennt offline ausdrücklich, wenn der Proxy nicht antwortet', async () => {
    readFactoryDefault.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await GET(call('admin'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('proxy_unreachable');
    expect(body.model ?? null).toBeNull();
  });
});

describe('PUT /sdlc/api/llm-proxy/factory', () => {
  it('401 ohne Session', async () => {
    const res = await PUT(call(null, { method: 'PUT', body: JSON.stringify({ model: 'x' }) }));
    expect(res.status).toBe(401);
  });

  it('403 ohne Admin-Rolle', async () => {
    const res = await PUT(call('user', { method: 'PUT', body: JSON.stringify({ model: 'x' }) }));
    expect(res.status).toBe(403);
  });

  it('reicht model, locked und mtimeMs weiter', async () => {
    writeFactoryDefault.mockResolvedValueOnce({ saved: true, mtimeMs: 1724300009999 });
    const res = await PUT(call('admin', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gemma12-vision', locked: true, mtimeMs: 1724300000000 }),
    }));
    expect(res.status).toBe(200);
    expect(writeFactoryDefault).toHaveBeenCalledWith('gemma12-vision', true, 1724300000000);
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.mtimeMs).toBe(1724300009999);
  });

  it('übersetzt einen Konflikt des Proxy in einen eigenen 409 mit Fehlerschlüssel', async () => {
    const conflict = new Error('stale');
    conflict.name = 'FactoryWriteConflictError';
    writeFactoryDefault.mockRejectedValueOnce(conflict);
    const res = await PUT(call('admin', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gemma12-vision', locked: false, mtimeMs: 1 }),
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('stale_factory_write');
    // nicht der generische 500-Pfad
    expect(res.status).not.toBe(500);
  });
});
