import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../lib/website-db', () => ({
  setJsonSetting: vi.fn(),
  NAV_KEY: 'navigation',
  FOOTER_KEY: 'footer',
  STAMMDATEN_KEY: 'stammdaten',
  KORE_FLAGS_KEY: 'kore_flags',
}));

import { getSession, isAdmin } from '../../../lib/auth';
import { setJsonSetting } from '../../../lib/website-db';
import { POST as navPOST } from './navigation/save';
import { POST as footerPOST } from './footer/save';
import { POST as stammdatenPOST } from './stammdaten/save';
import { POST as koreFlagsPOST } from './kore-flags/save';

type Ctx = Parameters<typeof navPOST>[0];

function jsonReq(body: unknown): Request {
  return new Request('http://x/api/admin/x/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(setJsonSetting).mockReset();
  vi.mocked(setJsonSetting).mockResolvedValue(undefined);
});

function asAdmin() {
  vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' } } as never);
  vi.mocked(isAdmin).mockReturnValue(true);
}

describe('content-section save endpoints', () => {
  it('navigation/save persists the posted array under NAV_KEY', async () => {
    asAdmin();
    const nav = [{ label: 'Leistungen', href: '/leistungen', order: 1 }];
    const r = await navPOST({ request: jsonReq(nav) } as unknown as Ctx);
    expect(r.status).toBe(200);
    expect(vi.mocked(setJsonSetting)).toHaveBeenCalledWith('mentolder', 'navigation', nav);
  });

  it('footer/save persists columns + copyright under FOOTER_KEY', async () => {
    asAdmin();
    const footer = { columns: [{ heading: 'Mehr', links: [{ label: 'Blog', href: '/blog' }] }], copyright: '© 2026' };
    const r = await footerPOST({ request: jsonReq(footer) } as unknown as Ctx);
    expect(r.status).toBe(200);
    expect(vi.mocked(setJsonSetting)).toHaveBeenCalledWith('mentolder', 'footer', footer);
  });

  it('stammdaten/save persists the master-data object under STAMMDATEN_KEY', async () => {
    asAdmin();
    const sd = { name: 'P', role: 'Coach', email: 'a@b.de', phone: '', street: '', zip: '', city: 'Berlin', ustId: '', website: '', avatarInitials: 'P' };
    const r = await stammdatenPOST({ request: jsonReq(sd) } as unknown as Ctx);
    expect(r.status).toBe(200);
    expect(vi.mocked(setJsonSetting)).toHaveBeenCalledWith('mentolder', 'stammdaten', sd);
  });

  it('kore-flags/save coerces timeline to boolean under KORE_FLAGS_KEY', async () => {
    asAdmin();
    const r = await koreFlagsPOST({ request: jsonReq({ timeline: 1 }) } as unknown as Ctx);
    expect(r.status).toBe(200);
    expect(vi.mocked(setJsonSetting)).toHaveBeenCalledWith('mentolder', 'kore_flags', { timeline: true });
  });

  it('rejects non-admin with 403 and never writes', async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    vi.mocked(isAdmin).mockReturnValue(false);
    const r = await navPOST({ request: jsonReq([]) } as unknown as Ctx);
    expect(r.status).toBe(403);
    expect(vi.mocked(setJsonSetting)).not.toHaveBeenCalled();
  });

  it('rejects a malformed body shape with 400', async () => {
    asAdmin();
    const r = await navPOST({ request: jsonReq({ not: 'an array' }) } as unknown as Ctx);
    expect(r.status).toBe(400);
    const rf = await footerPOST({ request: jsonReq({ columns: 'nope' }) } as unknown as Ctx);
    expect(rf.status).toBe(400);
    expect(vi.mocked(setJsonSetting)).not.toHaveBeenCalled();
  });
});
