import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../../lib/website-db';
import { POST } from './timeline';

type RouteContext = Parameters<typeof POST>[0];

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://web.example.test/api/internal/applications/timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

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

describe('POST /api/internal/applications/timeline', () => {
  it('rejects request without x-internal-token with 403 and does not insert', async () => {
    const res = await POST({
      request: req({ job_id: 1, event_type: 'interview', notes: 'x' }),
    } as unknown as RouteContext);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects request with wrong x-internal-token with 403 and does not insert', async () => {
    const res = await POST({
      request: req({ job_id: 1, event_type: 'interview', notes: 'x' }, { 'x-internal-token': 'wrong' }),
    } as unknown as RouteContext);
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('inserts a timeline row for an authorized request', async () => {
    const createdAt = '2026-09-17T12:00:00.000Z';
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 42, created_at: createdAt }] } as never);
    const res = await POST({
      request: req(
        { job_id: 1, event_type: 'interview_feedback', notes: 'went well' },
        { 'x-internal-token': 'test-token' },
      ),
    } as unknown as RouteContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 42, created_at: createdAt });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO applications.timeline'),
      [1, 'interview_feedback', 'went well'],
    );
  });

  it.each([
    { job_id: 0, event_type: 'interview_feedback' },
    { job_id: 1.5, event_type: 'interview_feedback' },
    { job_id: 1, event_type: '' },
    { job_id: 1, event_type: 'interview_feedback', notes: 42 },
  ])('rejects malformed authorized payloads without inserting', async (body) => {
    const res = await POST({
      request: req(body, { 'x-internal-token': 'test-token' }),
    } as unknown as RouteContext);
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
