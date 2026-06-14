import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const session = { sub: 'u1', preferred_username: 'admin', roles: ['admin'] };
const getSession = vi.fn();
const isAdmin = vi.fn();
vi.mock('../../../../lib/auth', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));

import { GET } from './env-status';

const req = () => new Request('http://t/api/admin/ki/env-status', { headers: { cookie: 'x' } });
const ENV = { ...process.env };

beforeEach(() => { getSession.mockReset(); isAdmin.mockReset(); });
afterEach(() => { process.env = { ...ENV }; });

it('401 without session', async () => {
  getSession.mockResolvedValue(null);
  expect((await GET({ request: req() } as never)).status).toBe(401);
});

it('reports booleans and host ip, never the secret value', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  process.env.ANTHROPIC_API_KEY = 'sk-secret';
  delete process.env.VOYAGE_API_KEY;
  process.env.LLM_ENABLED = 'true';
  process.env.LLM_HOST_IP = '10.0.0.3';
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.ANTHROPIC_API_KEY).toBe(true);
  expect(json.VOYAGE_API_KEY).toBe(false);
  expect(json.LLM_ENABLED).toBe(true);
  expect(json.LLM_HOST_IP).toBe('10.0.0.3');
  expect(JSON.stringify(json)).not.toContain('sk-secret');
});
