import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { sub: 'u1', preferred_username: 'admin', roles: ['admin'] };
const getSession = vi.fn();
const isAdmin = vi.fn();
vi.mock('../../../../../lib/auth', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));
const db = vi.hoisted(() => ({
  getProvider: vi.fn(), updateProvider: vi.fn(), deleteProvider: vi.fn(),
  countEnabledForSource: vi.fn(),
}));
vi.mock('../../../../../lib/ki-config-db', () => db);

import { PUT, DELETE } from './[id]';

function ctx(id: string, body?: unknown, method = 'PUT') {
  return {
    params: { id },
    request: new Request(`http://t/api/admin/ki/providers/${id}`, {
      method, headers: { cookie: 'x' }, body: body ? JSON.stringify(body) : undefined,
    }),
  } as never;
}

beforeEach(() => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  Object.values(db).forEach((f) => f.mockReset());
});

describe('PUT [id]', () => {
  it('400 on non-numeric id', async () => {
    const r = await PUT(ctx('abc', { priority: 1 }));
    expect(r.status).toBe(400);
  });
  it('409 on unique-priority conflict', async () => {
    db.updateProvider.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const r = await PUT(ctx('5', { priority: 1 }));
    expect(r.status).toBe(409);
  });
  it('200 on success', async () => {
    db.updateProvider.mockResolvedValue(true);
    const r = await PUT(ctx('5', { priority: 2 }));
    expect(r.status).toBe(200);
  });
  it('404 when row missing', async () => {
    db.updateProvider.mockResolvedValue(false);
    const r = await PUT(ctx('5', { priority: 2 }));
    expect(r.status).toBe(404);
  });
});

describe('DELETE [id]', () => {
  it('409 when deleting the last enabled provider of its action', async () => {
    db.getProvider.mockResolvedValue({ id: 5, source: 'chat/*', tier: 'sonnet', enabled: true });
    db.countEnabledForSource.mockResolvedValue(0); // none left after excluding id 5
    const r = await DELETE(ctx('5', undefined, 'DELETE'));
    expect(r.status).toBe(409);
    expect(db.deleteProvider).not.toHaveBeenCalled();
  });
  it('200 when other enabled providers remain', async () => {
    db.getProvider.mockResolvedValue({ id: 5, source: 'chat/*', tier: 'sonnet', enabled: true });
    db.countEnabledForSource.mockResolvedValue(1);
    db.deleteProvider.mockResolvedValue(true);
    const r = await DELETE(ctx('5', undefined, 'DELETE'));
    expect(r.status).toBe(200);
  });
  it('404 when row missing', async () => {
    db.getProvider.mockResolvedValue(null);
    const r = await DELETE(ctx('5', undefined, 'DELETE'));
    expect(r.status).toBe(404);
  });
});
