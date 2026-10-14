import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock('../../../lib/sdlc/plan-slots', () => ({
  autoSlots: vi.fn(() => ({ width: 3, slotsDirect: 3, slotsCloud: 0 })),
  parseManifestPartials: vi.fn(() => [
    { id: 'p1', dependsOn: [] },
    { id: 'p2', dependsOn: [] },
    { id: 'p3', dependsOn: [] },
  ]),
}));

import { getSession, isAdmin } from '../../../lib/auth';
import { GET } from './plan-runner';

const req = (url: string) => new Request(url);

describe('GET /sdlc/api/plan-runner', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ user: 'admin' } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('weist ohne Session ab (401)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: req('http://x/sdlc/api/plan-runner?slug=demo') } as never);
    expect(res.status).toBe(401);
  });

  it('weist ungültige Slugs ab (400, kein Pfad-Traversal)', async () => {
    const res = await GET({ request: req('http://x/sdlc/api/plan-runner?slug=..%2F..%2Fetc') } as never);
    expect(res.status).toBe(400);
  });

  it('meldet unbekannte Pläne (404)', async () => {
    const res = await GET({ request: req('http://x/sdlc/api/plan-runner?slug=gibtsnicht') } as never);
    expect(res.status).toBe(404);
  });
});
