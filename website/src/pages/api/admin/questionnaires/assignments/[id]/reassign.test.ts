import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './reassign';

vi.mock('../../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../../lib/questionnaire-db', () => ({
  reassignQAssignment: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../../../lib/auth';
import { reassignQAssignment } from '../../../../../../lib/questionnaire-db';

function req(): Request {
  return new Request('http://x', { method: 'POST', headers: { cookie: 'k=v' } });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(reassignQAssignment).mockReset();
  delete process.env.PROD_DOMAIN;
});

describe('POST /api/admin/questionnaires/assignments/[id]/reassign', () => {
  it('401 when not admin', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const r = await POST({ request: req(), params: { id: 'a' } } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(401);
  });

  it('400 when id missing', async () => {
    vi.mocked(getSession).mockResolvedValue({} as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    const r = await POST({ request: req(), params: {} } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(400);
  });

  it('404 when source missing', async () => {
    vi.mocked(getSession).mockResolvedValue({} as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(reassignQAssignment).mockResolvedValue({ reason: 'not_found' } as never);
    const r = await POST({ request: req(), params: { id: 'a' } } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(404);
  });

  it('200 with portalUrl (relative when PROD_DOMAIN unset)', async () => {
    vi.mocked(getSession).mockResolvedValue({} as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(reassignQAssignment).mockResolvedValue({
      assignment: { id: 'newId' } as never,
    });
    const r = await POST({ request: req(), params: { id: 'a' } } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.assignment.id).toBe('newId');
    expect(body.portalUrl).toBe('/portal/fragebogen/newId');
  });

  it('200 with absolute portalUrl when PROD_DOMAIN set', async () => {
    process.env.PROD_DOMAIN = 'example.com';
    vi.mocked(getSession).mockResolvedValue({} as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(reassignQAssignment).mockResolvedValue({
      assignment: { id: 'newId' } as never,
    });
    const r = await POST({ request: req(), params: { id: 'a' } } as unknown as Parameters<typeof POST>[0]);
    const body = await r.json();
    expect(body.portalUrl).toBe('https://web.example.com/portal/fragebogen/newId');
  });
});
