import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../../lib/website-db';
import { GET } from './detail';

type RouteContext = Parameters<typeof GET>[0];

const req = (id: string, headers: Record<string, string> = {}) =>
  new Request(`https://web.example.test/api/internal/applications/${id}/detail`, { headers });

function makeContext(id: string, headers: Record<string, string> = {}): RouteContext {
  return { request: req(id, headers), params: { id } } as unknown as RouteContext;
}

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

describe('GET /api/internal/applications/:id/detail', () => {
  it('rejects request without x-internal-token with 403', async () => {
    const res = await GET(makeContext('1'));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects request with wrong x-internal-token with 403', async () => {
    const res = await GET(makeContext('1', { 'x-internal-token': 'wrong' }));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 400 for missing id', async () => {
    const res = await GET(makeContext('', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent job', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const res = await GET(makeContext('999', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(404);
  });

  it('returns full job detail with match score and dossiers', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          id: 1, company: 'Acme', role_title: 'Dev', status: 'applied',
          source_url: 'https://example.com', raw_text: 'Test', requirements: 'Node.js',
          match_score: 75.5, match_evidence_ids: ['evidence_1', 'evidence_2'],
          dossier_count: 2,
          created_at: '2026-09-18T10:00:00Z', updated_at: '2026-09-19T14:00:00Z',
        },
      ],
    } as never);
    const res = await GET(makeContext('1', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.company).toBe('Acme');
    expect(body.status).toBe('applied');
    expect(body.match_score).toBe(75.5);
    expect(body.match_evidence_ids).toEqual(['evidence_1', 'evidence_2']);
    expect(body.dossier_count).toBe(2);
  });
});
