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

it('GET returns Gemma primary + null fallback + rerankEnabled (BGE ersetzt)', async () => {
  getSiteSetting.mockResolvedValueOnce('bge-m3').mockResolvedValueOnce('voyage');
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.primary).toBe('embeddinggemma-300m');
  expect(json.fallback).toBeNull();
  expect(json).toHaveProperty('rerankEnabled');
  expect(typeof json.rerankEnabled).toBe('boolean');
});

it('PUT rejects invalid primary', async () => {
  const r = await PUT({ request: req({ primary: 'gpt', fallback: null }) } as never);
  expect(r.status).toBe(400);
});

it('PUT writes Gemma/null, rejects bge-m3 und voyage', async () => {
  const ok = await PUT({ request: req({ primary: 'embeddinggemma-300m', fallback: null }) } as never);
  expect(ok.status).toBe(200);
  expect(setSiteSetting).toHaveBeenCalledTimes(2);
  const badFallback = await PUT({ request: req({ primary: 'embeddinggemma-300m', fallback: 'voyage' }) } as never);
  expect(badFallback.status).toBe(400);
  const badPrimary = await PUT({ request: req({ primary: 'bge-m3', fallback: null }) } as never);
  expect(badPrimary.status).toBe(400);
});
