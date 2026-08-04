import { it, expect, vi, beforeEach, afterEach } from 'vitest';

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
const realFetch = global.fetch;

beforeEach(() => { getSession.mockReset(); isAdmin.mockReset(); });
afterEach(() => { process.env = { ...ENV }; global.fetch = realFetch; vi.restoreAllMocks(); });

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
  global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.ANTHROPIC_API_KEY).toBe(true);
  expect(json.VOYAGE_API_KEY).toBe(false);
  expect(json.LLM_ENABLED).toBe(true);
  expect(json.LLM_HOST_IP).toBe('10.0.0.3');
  expect(JSON.stringify(json)).not.toContain('sk-secret');
});

it('localGpu: lmstudio reachable returns model ids, ollama unreachable returns reachable:false', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('1234')) {
      return Promise.resolve(new Response(
        JSON.stringify({ data: [{ id: 'qwen2.5-7b' }, { id: 'mistral-7b' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    }
    return Promise.reject(new Error('ECONNREFUSED'));
  }) as never;
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.localGpu.lmstudio.reachable).toBe(true);
  expect(json.localGpu.lmstudio.models).toEqual(['qwen2.5-7b', 'mistral-7b']);
  expect(json.localGpu.ollama.reachable).toBe(false);
});

it('localGpu: non-2xx response counts as unreachable', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  global.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500 })) as never;
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.localGpu.lmstudio.reachable).toBe(false);
  expect(json.localGpu.ollama.reachable).toBe(false);
});

it('localGpu: uses LLM_HOST_IP as probe target when set (not localhost)', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  process.env.LLM_HOST_IP = '10.20.0.5';
  const fetchedUrls: string[] = [];
  global.fetch = vi.fn().mockImplementation((url: string) => {
    fetchedUrls.push(url);
    return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }) as never;
  await GET({ request: req() } as never);
  expect(fetchedUrls.some(u => u.includes('10.20.0.5:1234'))).toBe(true);
  expect(fetchedUrls.some(u => u.includes('10.20.0.5:11434'))).toBe(true);
  expect(fetchedUrls.every(u => !u.includes('localhost'))).toBe(true);
});
