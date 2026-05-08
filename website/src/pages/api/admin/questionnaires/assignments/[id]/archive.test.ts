import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './archive';

vi.mock('../../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../../lib/questionnaire-db', () => ({
  archiveQAssignment: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../../../lib/auth';
import { archiveQAssignment } from '../../../../../../lib/questionnaire-db';

function req(): Request {
  return new Request('http://x', { method: 'POST', headers: { cookie: 'k=v' } });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(archiveQAssignment).mockReset();
});

describe('POST /api/admin/questionnaires/assignments/[id]/archive', () => {
  it('401 when no session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(401);
  });

  it('401 when not admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(false);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(401);
  });

  it('400 when id missing', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    const r = await POST({ request: req(), params: {} } as any);
    expect(r.status).toBe(400);
  });

  it('404 when archive helper returns not_found', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(archiveQAssignment).mockResolvedValue({ reason: 'not_found' } as any);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(404);
  });

  it('409 when status not archivable', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(archiveQAssignment).mockResolvedValue({
      reason: 'not_archivable', status: 'pending',
    } as any);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.status).toBe('pending');
  });

  it('200 with assignment on success', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(archiveQAssignment).mockResolvedValue({
      assignment: { id: 'a', status: 'archived' } as any,
    });
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.assignment.id).toBe('a');
  });
});
