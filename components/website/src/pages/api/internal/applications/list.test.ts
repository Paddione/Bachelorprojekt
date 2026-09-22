import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../../lib/auth', () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './list';

type RouteContext = Parameters<typeof GET>[0];

const req = (headers: Record<string, string> = {}) =>
  new Request('https://web.example.test/api/internal/applications/list', { headers });

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = 'test-token';
  vi.mocked(pool.query).mockReset();
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = saved;
});

describe('GET /api/internal/applications/list', () => {
  it('rejects unauthenticated request without token or session with 403', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: req() } as unknown as RouteContext);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects request with wrong x-internal-token and no session with 403', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: req({ 'x-internal-token': 'wrong' }) } as unknown as RouteContext);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('accepts request with admin session cookie', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'admin-1', username: 'admin' } as never);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { id: 1, company: 'Acme', role_title: 'Dev', status: 'found', dossier_count: '0' },
      ],
    } as never);
    const res = await GET({ request: req({ cookie: 'session=val' }) } as unknown as RouteContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.found).toHaveLength(1);
  });

  it('returns applications grouped by status for an authorized request', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { id: 1, company: 'Acme', role_title: 'Dev', status: 'found', dossier_count: '0', match_score: null, match_evidence_ids: null, source_url: null },
        { id: 2, company: 'Globex', role_title: 'QA', status: 'applied', dossier_count: '2', match_score: 75, match_evidence_ids: ['FLEET-001'], source_url: 'http://example.com' },
        { id: 3, company: 'Initech', role_title: 'PM', status: 'applied', dossier_count: '1', match_score: 30, match_evidence_ids: null, source_url: null },
        { id: 4, company: 'Wayne', role_title: 'Ops', status: 'rejected', dossier_count: '0', match_score: 10, match_evidence_ids: null, source_url: null },
      ],
    } as never);
    const res = await GET({ request: req({ 'x-internal-token': 'test-token' }) } as unknown as RouteContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.found).toHaveLength(1);
    expect(body.applied).toHaveLength(2);
    expect(body.rejected).toHaveLength(1);
    expect(body.found[0]).toEqual({ id: 1, company: 'Acme', role_title: 'Dev', dossier_count: 0, match_score: null, match_evidence_ids: null, source_url: null });
    expect(body.drafting).toEqual([]);
    expect(body.interviewing).toEqual([]);
    expect(body.offered).toEqual([]);
  });
});
