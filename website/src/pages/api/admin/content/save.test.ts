import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock('../../../../lib/website-db', () => ({
  writeContent: vi.fn(),
  ContentConflictError: class ContentConflictError extends Error {
    code = 'CONFLICT';
    constructor(public currentVersion: number, public currentValue: unknown) { super('conflict'); }
  },
}));
vi.mock('../../../../lib/content-registry', () => ({ refFor: vi.fn() }));
vi.mock('../../../../lib/admin/schemas/index', () => ({ validateSection: vi.fn() }));

import { getSession, isAdmin } from '../../../../lib/auth';
import { writeContent, ContentConflictError } from '../../../../lib/website-db';
import { refFor } from '../../../../lib/content-registry';
import { validateSection } from '../../../../lib/admin/schemas/index';
import { POST } from './save';

function jsonReq(body: unknown) {
  return new Request('http://x/api/admin/content/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(writeContent).mockReset();
  vi.mocked(refFor).mockReset();
  vi.mocked(validateSection).mockReset();
});

function asAdmin() {
  vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' }, email: 'admin@test.de' } as never);
  vi.mocked(isAdmin).mockReturnValue(true);
}

describe('POST /api/admin/content/save', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST({ request: jsonReq({ contentKey: 'kontakt', baseVersion: 0, payload: {} }), url: new URL('http://x/') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 200 with version on valid save', async () => {
    asAdmin();
    vi.mocked(refFor).mockReturnValue({ contentKey: 'kontakt', contentType: 'site_setting', storeKey: 'kontakt', publicRoute: '/kontakt' });
    vi.mocked(validateSection).mockReturnValue([]);
    vi.mocked(writeContent).mockResolvedValue({ version: 3 });
    const res = await POST({ request: jsonReq({ contentKey: 'kontakt', baseVersion: 2, payload: { email: 'a@b.de' } }), url: new URL('http://x/') } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 3 });
  });

  it('returns 409 on conflict', async () => {
    asAdmin();
    vi.mocked(refFor).mockReturnValue({ contentKey: 'kontakt', contentType: 'site_setting', storeKey: 'kontakt', publicRoute: '/kontakt' });
    vi.mocked(validateSection).mockReturnValue([]);
    vi.mocked(writeContent).mockRejectedValue(new ContentConflictError(5, { old: 'value' }, null));
    const res = await POST({ request: jsonReq({ contentKey: 'kontakt', baseVersion: 2, payload: {} }), url: new URL('http://x/') } as any);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toHaveProperty('currentVersion', 5);
  });

  it('returns 422 on validation error', async () => {
    asAdmin();
    vi.mocked(refFor).mockReturnValue({ contentKey: 'kontakt', contentType: 'site_setting', storeKey: 'kontakt', publicRoute: '/kontakt' });
    vi.mocked(validateSection).mockReturnValue([{ field: 'email', message: 'invalid' }]);
    const res = await POST({ request: jsonReq({ contentKey: 'kontakt', baseVersion: 0, payload: { email: 'bad' } }), url: new URL('http://x/') } as any);
    expect(res.status).toBe(422);
  });
});
