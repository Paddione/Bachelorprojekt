import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../../lib/website-db';
import { GET } from './list';

type RouteContext = Parameters<typeof GET>[0];

const req = (headers: Record<string, string> = {}) =>
  new Request('https://web.example.test/api/internal/applications/list', { headers });

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = 'test-token';
  vi.mocked(pool.query).mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = saved;
});

describe('GET /api/internal/applications/list', () => {
  it('rejects request without x-internal-token with 403 and no data', async () => {
    const res = await GET({ request: req() } as unknown as RouteContext);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects request with wrong x-internal-token with 403', async () => {
    const res = await GET({ request: req({ 'x-internal-token': 'wrong' }) } as unknown as RouteContext);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns applications grouped by status for an authorized request', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { id: 1, company: 'Acme', role_title: 'Dev', status: 'found', dossier_count: '0' },
        { id: 2, company: 'Globex', role_title: 'QA', status: 'applied', dossier_count: '2' },
        { id: 3, company: 'Initech', role_title: 'PM', status: 'applied', dossier_count: '1' },
      ],
    } as never);
    const res = await GET({ request: req({ 'x-internal-token': 'test-token' }) } as unknown as RouteContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.found).toHaveLength(1);
    expect(body.applied).toHaveLength(2);
    expect(body.found[0]).toEqual({ id: 1, company: 'Acme', role_title: 'Dev', dossier_count: 0 });
    expect(body.drafting).toEqual([]);
    expect(body.interviewing).toEqual([]);
    expect(body.offered).toEqual([]);
  });
});
