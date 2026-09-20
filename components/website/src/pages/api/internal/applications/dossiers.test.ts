import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../../lib/website-db';
import { GET } from './dossiers';

type RouteContext = Parameters<typeof GET>[0];

const req = (id: string, headers: Record<string, string> = {}) =>
  new Request(`https://web.example.test/api/internal/applications/${id}/dossiers`, { headers });

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

describe('GET /api/internal/applications/:id/dossiers', () => {
  it('rejects request without x-internal-token with 403', async () => {
    const res = await GET(makeContext('1'));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns empty array for job with no dossiers', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const res = await GET(makeContext('1', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns dossiers sorted by created_at DESC', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { id: 1, job_id: 1, artifact_path: '/docs/resume.pdf', kind: 'resume', created_at: '2026-09-18T10:00:00Z' },
        { id: 2, job_id: 1, artifact_path: '/docs/cover.pdf', kind: 'cover_letter', created_at: '2026-09-17T10:00:00Z' },
      ],
    } as never);
    const res = await GET(makeContext('1', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].kind).toBe('resume');
    expect(body[1].kind).toBe('cover_letter');
  });
});
