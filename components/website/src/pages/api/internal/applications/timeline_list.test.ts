import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../../lib/website-db';
import { GET } from './timeline_list';

type RouteContext = Parameters<typeof GET>[0];

function makeContext(id: string, headers: Record<string, string> = {}): RouteContext {
  return {
    request: new Request(`https://web.example.test/api/internal/applications/${id}/timeline`, { headers }),
    params: { id },
  } as unknown as RouteContext;
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

describe('GET /api/internal/applications/:id/timeline', () => {
  it('rejects request without x-internal-token with 403', async () => {
    const res = await GET(makeContext('1'));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns empty array for job with no timeline', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const res = await GET(makeContext('1', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns timeline events sorted by created_at DESC', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { id: 2, job_id: 1, event_type: 'interview_feedback', notes: 'positive', created_at: '2026-09-19T14:00:00Z' },
        { id: 1, job_id: 1, event_type: 'application_submitted', notes: 'via portal', created_at: '2026-09-18T10:00:00Z' },
      ],
    } as never);
    const res = await GET(makeContext('1', { 'x-internal-token': 'test-token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].event_type).toBe('interview_feedback');
    expect(body[1].event_type).toBe('application_submitted');
  });
});
