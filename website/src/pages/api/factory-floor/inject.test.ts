import { describe, it, expect, vi } from 'vitest';

// NOTE: the route ([extId]/inject.ts) imports '../../../../lib/auth' which resolves to
// src/lib/auth; from THIS test file the same module is '../../../lib/auth'. Mock by the
// path that resolves to the real module (vi.mock matches the resolved module).
vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) => (cookie === 'admin' ? { preferred_username: 'admin', groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: { groups?: string[] } | null | undefined) => s?.groups?.includes('admins') ?? false),
}));
const insertInjection = vi.fn(async (..._args: any[]) => ({ id: 'x' }));
vi.mock('../../../lib/factory-floor', () => ({ insertInjection: (...a: any[]) => insertInjection(...a) }));

import { POST } from './[extId]/inject';

function req(cookie: string | null, body: unknown): Request {
  return new Request('http://x/api/factory-floor/T000459/inject', {
    method: 'POST',
    headers: cookie ? { cookie, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/factory-floor/[extId]/inject', () => {
  it('401 without an admin session', async () => {
    const res = await POST({ request: req(null, { kind: 'note', content: 'x' }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(401);
  });

  it('400 on missing kind', async () => {
    const res = await POST({ request: req('admin', { content: 'x' }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(400);
  });

  it('201 inserts a context injection for an admin', async () => {
    insertInjection.mockResolvedValueOnce({ id: 'abc' } as never);
    const res = await POST({ request: req('admin', { kind: 'context', content: 'hi', phase: 'implement' }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(201);
    expect(insertInjection).toHaveBeenCalled();
  });

  it('413 when content exceeds the cap', async () => {
    const res = await POST({ request: req('admin', { kind: 'note', content: 'a'.repeat(9000) }), params: { extId: 'T000459' } } as any);
    expect(res.status).toBe(413);
  });
});
