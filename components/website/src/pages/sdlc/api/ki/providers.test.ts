import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { sub: 'u1', preferred_username: 'admin', roles: ['admin'] };
const getSession = vi.fn();
const isAdmin = vi.fn();
vi.mock('../../../../lib/auth', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));

const db = vi.hoisted(() => ({
  listProviders: vi.fn(), listHealth: vi.fn(), createProvider: vi.fn(),
}));
vi.mock('../../../../lib/ki-config-db', () => db);

import { GET, POST } from './providers';

function req(body?: unknown) {
  return new Request('http://t/api/admin/ki/providers', {
    method: body ? 'POST' : 'GET',
    headers: { cookie: 'x' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  getSession.mockReset(); isAdmin.mockReset();
  Object.values(db).forEach((f) => f.mockReset());
});

describe('GET /api/admin/ki/providers', () => {
  it('401 without session', async () => {
    getSession.mockResolvedValue(null);
    const r = await GET({ request: req() } as never);
    expect(r.status).toBe(401);
  });
  it('403 for non-admin', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(false);
    const r = await GET({ request: req() } as never);
    expect(r.status).toBe(403);
  });
  it('returns entries + health for admin', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
    db.listProviders.mockResolvedValue([{ id: 1 }]);
    db.listHealth.mockResolvedValue([{ provider: 'anthropic' }]);
    const r = await GET({ request: req() } as never);
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.entries).toHaveLength(1);
    expect(json.health).toHaveLength(1);
  });
});

describe('POST /api/admin/ki/providers', () => {
  it('400 on missing required field', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
    const r = await POST({ request: req({ source: 'chat/*' }) } as never);
    expect(r.status).toBe(400);
  });
  it('400 on invalid tier', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
    const r = await POST({ request: req({
      source: 'chat/*', tier: 'opus', priority: 1, provider: 'x', model_id: 'm',
    }) } as never);
    expect(r.status).toBe(400);
  });
  it('409 on unique-priority conflict', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
    db.createProvider.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const r = await POST({ request: req({
      source: 'chat/*', tier: 'sonnet', priority: 1, provider: 'x', model_id: 'm',
    }) } as never);
    expect(r.status).toBe(409);
  });
  it('201 with new id on success', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
    db.createProvider.mockResolvedValue(42);
    const r = await POST({ request: req({
      source: 'chat/*', tier: 'sonnet', priority: 1, provider: 'x', model_id: 'm',
    }) } as never);
    expect(r.status).toBe(201);
    expect((await r.json()).id).toBe(42);
  });
});
