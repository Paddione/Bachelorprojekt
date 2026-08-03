import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { sub: 'u1', preferred_username: 'admin', roles: ['admin'] };
const getSession = vi.fn();
const isAdmin = vi.fn();
vi.mock('../../../../lib/auth', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));

import { GET } from './catalog';

const req = () => new Request('http://t/api/admin/ki/catalog', { headers: { cookie: 'x' } });

beforeEach(() => { getSession.mockReset(); isAdmin.mockReset(); });

describe('GET /api/admin/ki/catalog', () => {
  it('401 ohne Session', async () => {
    getSession.mockResolvedValue(null);
    expect((await GET({ request: req() } as never)).status).toBe(401);
  });

  it('403 ohne Admin', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(false);
    expect((await GET({ request: req() } as never)).status).toBe(403);
  });

  it('liefert Katalog + Service-Registry für Admins', async () => {
    getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
    const body = await (await GET({ request: req() } as never)).json();
    expect(body.catalog.map((i: { id: string }) => i.id)).toEqual(
      expect.arrayContaining(['anthropic', 'deepseek', 'custom']),
    );
    expect(body.services.map((s: { key: string }) => s.key)).toEqual(
      expect.arrayContaining(['website-llm', 'coaching']),
    );
  });
});
