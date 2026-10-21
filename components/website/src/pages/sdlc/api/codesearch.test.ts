// F6: codesearch meldet bei ausgeschaltetem Vektor-Store einheitlich 503
// 'vector store disabled' (statt 404) — Doktrin aus knowledge-db.ts.
// Auth-first: Unauthentifizierte erhalten 401, kein Flag-Leak.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../lib/auth';
import { GET } from './codesearch';

const OLD_ENV = process.env.VECTOR_DB_ENABLED;

function getRequest(): Request {
  return new Request('http://localhost/sdlc/api/codesearch?q=test&limit=5', {
    headers: { cookie: 'sid=x' },
  });
}

describe('codesearch GET vector-store-disabled (F6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.VECTOR_DB_ENABLED;
    else process.env.VECTOR_DB_ENABLED = OLD_ENV;
  });

  it('returns 401 for unauthenticated callers even when disabled (auth-first)', async () => {
    process.env.VECTOR_DB_ENABLED = '0';
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: getRequest() } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 503 vector store disabled for admins when disabled', async () => {
    process.env.VECTOR_DB_ENABLED = '0';
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    const res = await GET({ request: getRequest() } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'vector store disabled' });
  });

  it('passes the flag guard when enabled (400 for missing q proves guard order)', async () => {
    process.env.VECTOR_DB_ENABLED = '1';
    vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    const req = new Request('http://localhost/sdlc/api/codesearch', {
      headers: { cookie: 'sid=x' },
    });
    const res = await GET({ request: req, url: new URL(req.url) } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
  });
});
