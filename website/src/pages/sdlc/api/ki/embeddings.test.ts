import { it, expect, vi, beforeEach } from 'vitest';

const session = { sub: 'u1', preferred_username: 'admin', roles: ['admin'] };
const getSession = vi.fn();
const isAdmin = vi.fn();
vi.mock('../../../../lib/auth', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));
const getSiteSetting = vi.fn();
const setSiteSetting = vi.fn();
vi.mock('../../../../lib/website-db', () => ({
  getSiteSetting: (...a: unknown[]) => getSiteSetting(...a),
  setSiteSetting: (...a: unknown[]) => setSiteSetting(...a),
}));

import { GET, PUT } from './embeddings';

function req(body?: unknown) {
  return new Request('http://t/api/admin/ki/embeddings', {
    method: body ? 'PUT' : 'GET', headers: { cookie: 'x' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  getSiteSetting.mockReset(); setSiteSetting.mockReset();
});

it('GET returns primary + fallback + rerankEnabled with bge-m3 default', async () => {
  getSiteSetting.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.primary).toBe('bge-m3');
  expect(json.fallback).toBeNull();
  expect(json).toHaveProperty('rerankEnabled');
  expect(typeof json.rerankEnabled).toBe('boolean');
});

it('PUT rejects invalid primary', async () => {
  const r = await PUT({ request: req({ primary: 'gpt', fallback: null }) } as never);
  expect(r.status).toBe(400);
});

it('PUT writes both keys', async () => {
  const r = await PUT({ request: req({ primary: 'bge-m3', fallback: 'voyage' }) } as never);
  expect(r.status).toBe(200);
  expect(setSiteSetting).toHaveBeenCalledTimes(2);
});
