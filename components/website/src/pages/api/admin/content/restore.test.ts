import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock('../../../../lib/website-db', () => ({
  writeContent: vi.fn(),
  readContent: vi.fn(),
  listVersions: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { writeContent, readContent, listVersions } from '../../../../lib/website-db';
import { POST } from './restore';

function jsonReq(body: unknown) {
  return new Request('http://x/api/admin/content/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(writeContent).mockReset();
  vi.mocked(readContent).mockReset();
  vi.mocked(listVersions).mockReset();
});

it('returns 401 when not authenticated', async () => {
  vi.mocked(getSession).mockResolvedValue(null);
  const res = await POST({ request: jsonReq({ contentKey: 'kontakt', versionId: 1 }) } as Parameters<typeof POST>[0]);
  expect(res.status).toBe(401);
});

it('returns 404 for unknown versionId', async () => {
  vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' } } as never);
  vi.mocked(isAdmin).mockReturnValue(true);
  vi.mocked(listVersions).mockResolvedValue([{ id: 99, editor: 'x', createdAt: new Date(), snapshot: {} }]);
  const res = await POST({ request: jsonReq({ contentKey: 'kontakt', versionId: 1 }) } as Parameters<typeof POST>[0]);
  expect(res.status).toBe(404);
});

it('restores version by writing snapshot value with current live version as base', async () => {
  vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' }, email: 'admin@x.de' } as never);
  vi.mocked(isAdmin).mockReturnValue(true);
  vi.mocked(listVersions).mockResolvedValue([{ id: 5, editor: 'x', createdAt: new Date(), snapshot: { value: { footerEmail: 'old@b.de' }, version: 1 } }]);
  vi.mocked(readContent).mockResolvedValue({ value: { footerEmail: 'new@b.de' }, version: 3 });
  vi.mocked(writeContent).mockResolvedValue({ version: 4 });
  const res = await POST({ request: jsonReq({ contentKey: 'kontakt', versionId: 5 }) } as Parameters<typeof POST>[0]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ version: 4 });
  expect(writeContent).toHaveBeenCalledWith(expect.any(String), 'kontakt', { footerEmail: 'old@b.de' }, 3, 'admin@x.de');
});
