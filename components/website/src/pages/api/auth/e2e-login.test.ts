import { describe, it, expect, vi } from 'vitest';

// T002068: e2e-login must find the Pocket-ID admin regardless of username
// casing — prod user is `Paddione`, the e2e harness logs in as `paddione`.

vi.mock('../../../lib/auth', () => ({
  issueSession: vi.fn(async () => 'session-id-1'),
  setSessionCookie: vi.fn(() => 'workspace_session=session-id-1; Path=/'),
}));

const users = [
  {
    id: 'u-1',
    username: 'Paddione',
    email: 'patrick@example.test',
    firstName: 'Patrick',
    lastName: 'K',
    isAdmin: true,
  },
];
vi.mock('../../../lib/identity', () => ({
  listUsers: vi.fn(async () => users),
}));

import { GET } from './e2e-login';

type RouteContext = Parameters<typeof GET>[0];

const req = (username: string) =>
  ({
    request: new Request(
      `https://web.example.test/api/auth/e2e-login?username=${encodeURIComponent(username)}&returnTo=%2Fadmin`,
    ),
  }) as unknown as RouteContext;

describe('e2e-login user matching', () => {
  it('finds the user on an exact username match', async () => {
    const res = await GET(req('Paddione'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('finds the user case-insensitively (paddione → Paddione)', async () => {
    const res = await GET(req('paddione'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('finds the user by email case-insensitively', async () => {
    const res = await GET(req('PATRICK@example.test'));
    expect(res.status).toBe(302);
  });

  it('still 404s for a genuinely unknown user', async () => {
    const res = await GET(req('nobody'));
    expect(res.status).toBe(404);
  });
});
