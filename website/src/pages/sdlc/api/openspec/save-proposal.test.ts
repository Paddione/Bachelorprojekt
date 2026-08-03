import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock('../../../../lib/openspec/proposal', () => ({
  isValidSlug: vi.fn(),
  writeProposal: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { isValidSlug, writeProposal } from '../../../../lib/openspec/proposal';
import { POST } from './save-proposal';

function jsonReq(body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json', cookie: 'session=test' }) {
  return new Request('http://x/api/admin/openspec/save-proposal', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(isValidSlug).mockReset();
  vi.mocked(writeProposal).mockReset();
});

function asAdmin() {
  vi.mocked(getSession).mockResolvedValue({ user: { sub: 'admin' }, email: 'admin@test.de' } as never);
  vi.mocked(isAdmin).mockReturnValue(true);
}

describe('POST /api/admin/openspec/save-proposal', () => {
  it('returns 403 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST({ request: jsonReq({ slug: 's1', content: 'hello' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
  });

  it('returns 200 on valid save-proposal request', async () => {
    asAdmin();
    vi.mocked(isValidSlug).mockReturnValue(true);
    vi.mocked(writeProposal).mockResolvedValue();

    const res = await POST({ request: jsonReq({ slug: 's1', content: 'hello' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(writeProposal).toHaveBeenCalledWith('s1', 'hello');
  });

  it('returns 400 when slug is invalid', async () => {
    asAdmin();
    vi.mocked(isValidSlug).mockReturnValue(false);

    const res = await POST({ request: jsonReq({ slug: '../x', content: 'hello' }) } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
