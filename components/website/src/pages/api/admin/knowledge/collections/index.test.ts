// F6: collections GET/POST melden bei ausgeschaltetem Vektor-Store einheitlich
// 503 'vector store disabled' — Doktrin aus knowledge-db.ts. Auth-first:
// Unauthentifizierte erhalten 401, kein Flag-Leak.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../../lib/auth';
import { GET, POST } from './index';

const OLD_ENV = process.env.VECTOR_DB_ENABLED;

function authedAdmin() {
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(isAdmin).mockReturnValue(true);
}

function unauthenticated() {
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(isAdmin).mockReturnValue(false);
}

describe('collections vector-store-disabled (F6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.VECTOR_DB_ENABLED;
    else process.env.VECTOR_DB_ENABLED = OLD_ENV;
  });

  it('GET returns 401 for unauthenticated callers even when disabled', async () => {
    process.env.VECTOR_DB_ENABLED = '0';
    unauthenticated();
    const res = await GET({
      request: new Request('http://localhost/api/admin/knowledge/collections'),
    } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('GET returns 503 vector store disabled for admins when disabled', async () => {
    process.env.VECTOR_DB_ENABLED = '0';
    authedAdmin();
    const res = await GET({
      request: new Request('http://localhost/api/admin/knowledge/collections'),
    } as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'vector store disabled' });
  });

  it('POST returns 401 for unauthenticated callers even when disabled', async () => {
    process.env.VECTOR_DB_ENABLED = '0';
    unauthenticated();
    const res = await POST({
      request: new Request('http://localhost/api/admin/knowledge/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      }),
    } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
  });

  it('POST returns 503 vector store disabled for admins when disabled', async () => {
    process.env.VECTOR_DB_ENABLED = '0';
    authedAdmin();
    const res = await POST({
      request: new Request('http://localhost/api/admin/knowledge/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      }),
    } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'vector store disabled' });
  });
});
