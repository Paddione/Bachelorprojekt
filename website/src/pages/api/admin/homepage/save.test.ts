import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserSession } from '../../../../lib/auth';
import type { HomepageBlocksDocumentType } from '../../../../lib/homepage-blocks-store';

let mockSession: UserSession | null = null;
let mockIsAdmin = false;
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
  isAdmin: vi.fn(() => mockIsAdmin),
}));

vi.mock('../../../../lib/homepage-blocks-store', () => {
  class HomepageConflictError extends Error {
    code = 'CONFLICT' as const;
    constructor(public currentVersion: number, public currentValue: HomepageBlocksDocumentType | null) { super('conflict'); }
  }
  class HomepageValidationError extends Error {
    code = 'INVALID' as const;
    constructor(public errors: { path: string; message: string }[]) { super('invalid'); }
  }
  return { save: vi.fn(), HomepageConflictError, HomepageValidationError };
});

import { POST } from './save';
import { save, HomepageConflictError, HomepageValidationError } from '../../../../lib/homepage-blocks-store';

const REACT = 'https://react.example.test';
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.REACT_APP_ORIGIN;
  process.env.REACT_APP_ORIGIN = REACT;
  mockSession = null;
  mockIsAdmin = false;
  vi.mocked(save).mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.REACT_APP_ORIGIN;
  else process.env.REACT_APP_ORIGIN = saved;
});

const post = (body: unknown, origin: string | null = REACT) =>
  POST({
    request: new Request('https://web.example.test/api/admin/homepage/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    }),
    locals: { requestLogger: { error: vi.fn() } },
  } as unknown as Parameters<typeof POST>[0]);

const adminSession: UserSession = { sub: 'u-1', email: 'g@mentolder.de', name: 'Gerald', preferred_username: 'gekko', realmRoles: ['admin'], brand: null, access_token: 'tok', refresh_token: 'rtok', expires_at: 9999999999 };

describe('POST /api/admin/homepage/save', () => {
  it('rejects an unauthenticated request with 401', async () => {
    mockSession = null;
    const res = await post({ baseVersion: 0, payload: {} });
    expect(res.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a non-admin with 401', async () => {
    mockSession = { ...adminSession, realmRoles: [] };
    mockIsAdmin = false;
    const res = await post({ baseVersion: 0, payload: {} });
    expect(res.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns 200 + version on a successful save', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    vi.mocked(save).mockResolvedValueOnce({ version: 7 });
    const res = await post({ baseVersion: 6, payload: { schemaVersion: 1, blocks: [] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 7 });
    expect(save).toHaveBeenCalledWith('mentolder', { schemaVersion: 1, blocks: [] }, 6, 'g@mentolder.de');
  });

  it('returns 422 + field errors on validation failure', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    vi.mocked(save).mockRejectedValueOnce(new HomepageValidationError([{ path: 'blocks.0.type', message: 'bad' }]));
    const res = await post({ baseVersion: 0, payload: { schemaVersion: 1, blocks: [{}] } });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0].path).toBe('blocks.0.type');
  });

  it('returns 409 + currentVersion on a version conflict', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    vi.mocked(save).mockRejectedValueOnce(new HomepageConflictError(9, { schemaVersion: 1, blocks: [] }));
    const res = await post({ baseVersion: 3, payload: { schemaVersion: 1, blocks: [] } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.currentVersion).toBe(9);
  });

  it('carries CORS headers for an allowlisted origin', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    vi.mocked(save).mockResolvedValueOnce({ version: 1 });
    const res = await post({ baseVersion: 0, payload: { schemaVersion: 1, blocks: [] } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
