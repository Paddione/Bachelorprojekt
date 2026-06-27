import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockSession: any = null;
let mockIsAdmin = false;
vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
  isAdmin: vi.fn(() => mockIsAdmin),
}));

vi.mock('../../../../lib/homepage-blocks-store', () => {
  class HomepageConflictError extends Error {
    code = 'CONFLICT' as const;
    constructor(public currentVersion: number, public currentValue: any) { super('conflict'); }
  }
  class HomepageValidationError extends Error {
    code = 'INVALID' as const;
    constructor(public errors: any[]) { super('invalid'); }
  }
  return { save: vi.fn(), HomepageConflictError, HomepageValidationError };
});

import { POST } from './save';
import { save, HomepageConflictError, HomepageValidationError } from '../../../../lib/homepage-blocks-store';

const REACT = 'https://react.mentolder.de';
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.REACT_APP_ORIGIN;
  process.env.REACT_APP_ORIGIN = REACT;
  mockSession = null;
  mockIsAdmin = false;
  (save as any).mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.REACT_APP_ORIGIN;
  else process.env.REACT_APP_ORIGIN = saved;
});

const post = (body: any, origin: string | null = REACT) =>
  POST({
    request: new Request('https://web.mentolder.de/api/admin/homepage/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    }),
    locals: { requestLogger: { error: vi.fn() } },
  } as any);

const adminSession = { email: 'g@mentolder.de', name: 'Gerald', preferred_username: 'gekko', realmRoles: ['admin'] };

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
    (save as any).mockResolvedValueOnce({ version: 7 });
    const res = await post({ baseVersion: 6, payload: { schemaVersion: 1, blocks: [] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 7 });
    expect(save).toHaveBeenCalledWith('mentolder', { schemaVersion: 1, blocks: [] }, 6, 'g@mentolder.de');
  });

  it('returns 422 + field errors on validation failure', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    (save as any).mockRejectedValueOnce(new HomepageValidationError([{ path: 'blocks.0.type', message: 'bad' }]));
    const res = await post({ baseVersion: 0, payload: { schemaVersion: 1, blocks: [{}] } });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0].path).toBe('blocks.0.type');
  });

  it('returns 409 + currentVersion on a version conflict', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    (save as any).mockRejectedValueOnce(new HomepageConflictError(9, { schemaVersion: 1, blocks: [] }));
    const res = await post({ baseVersion: 3, payload: { schemaVersion: 1, blocks: [] } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.currentVersion).toBe(9);
  });

  it('carries CORS headers for an allowlisted origin', async () => {
    mockSession = adminSession;
    mockIsAdmin = true;
    (save as any).mockResolvedValueOnce({ version: 1 });
    const res = await post({ baseVersion: 0, payload: { schemaVersion: 1, blocks: [] } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(REACT);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
