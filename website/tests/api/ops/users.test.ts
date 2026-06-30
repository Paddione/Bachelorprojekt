import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ preferred_username: 'paddione', realmRoles: ['admin'] })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/identity', () => ({
  listUsers: vi.fn(async () => [{ id: 'u1', username: 'gekko', email: 'g@example.com', firstName: 'Gekko', lastName: 'K.', groups: ['admin'] }]),
  listGroups: vi.fn(async () => [{ id: 'g1', name: 'admin' }, { id: 'g2', name: 'coach' }]),
  createUser: vi.fn(async () => ({ success: true, userId: 'u-new' })),
  assignUserToGroups: vi.fn(async () => true),
  sendPasswordResetEmail: vi.fn(async () => true),
}));
vi.mock('../../../src/lib/website-db', () => {
  const mockQuery = vi.fn()
    .mockResolvedValueOnce({ rows: [] })       // T2: checkConcurrent SELECT → no conflict
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // T2: startAction INSERT → id=1
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // T2: finishAction UPDATE
    .mockResolvedValueOnce({ rows: [] })       // T5: checkConcurrent SELECT → no conflict
    .mockResolvedValue({ rows: [{ id: 1 }] }); // T5: INSERT + finishAction + any subsequent
  return {
    pool: { query: mockQuery },
    platformPool: { query: mockQuery },
  };
});

import { GET as listUsersHandler } from '../../../src/pages/api/admin/ops/users/list';
import { POST as createUserHandler } from '../../../src/pages/api/admin/ops/users/create';

const adminReq = (body?: unknown) => new Request('http://test', {
  method: body ? 'POST' : 'GET',
  body: body ? JSON.stringify(body) : undefined,
  headers: { Cookie: 'session=ok', 'Content-Type': 'application/json' },
});

describe('GET /api/admin/ops/users/list', () => {
  it('returns user list', async () => {
    const res = await listUsersHandler({ request: adminReq() } as unknown as Parameters<typeof listUsersHandler>[0]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.users)).toBe(true);
  });
});

describe('POST /api/admin/ops/users/create', () => {
  it('creates user + sends invite by default', async () => {
    const res = await createUserHandler({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'x@y.de', groupIds: ['g2'] }) } as unknown as Parameters<typeof createUserHandler>[0]);
    expect(res.status).toBe(200);
    const kc = await import('../../../src/lib/identity');
    expect(kc.createUser).toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
    const res = await createUserHandler({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'not-email', groupIds: ['g2'] }) } as unknown as Parameters<typeof createUserHandler>[0]);
    expect(res.status).toBe(400);
  });

  it('returns 400 when groupIds is empty', async () => {
    const res = await createUserHandler({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'x@y.de', groupIds: [] }) } as unknown as Parameters<typeof createUserHandler>[0]);
    expect(res.status).toBe(400);
  });

  it('returns partial_success when invite email fails', async () => {
    const pi = await import('../../../src/lib/identity');
    vi.mocked(pi.sendPasswordResetEmail).mockRejectedValueOnce(new Error('smtp down'));
    const res = await createUserHandler({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'x@y.de', groupIds: ['g2'], sendInvite: true }) } as unknown as Parameters<typeof createUserHandler>[0]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.partial).toBe(true);
  });
});
