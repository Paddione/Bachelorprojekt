import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../../../lib/website-db';
import { PUT } from './index';

type RouteContext = Parameters<typeof PUT>[0];

function makeContext(id: string, headers: Record<string, string> = {}, body?: unknown): RouteContext {
  return {
    request: new Request(`https://web.example.test/api/internal/applications/${id}`, {
      headers,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
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

describe('PUT /api/internal/applications/:id', () => {
  it('rejects request without x-internal-token with 403', async () => {
    const res = await PUT(makeContext('1'));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects request with wrong x-internal-token with 403', async () => {
    const res = await PUT(makeContext('1', { 'x-internal-token': 'wrong' }));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects invalid status with 400', async () => {
    const res = await PUT(makeContext('1', { 'x-internal-token': 'test-token' }, { status: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing status with 400', async () => {
    const res = await PUT(makeContext('1', { 'x-internal-token': 'test-token' }, {}));
    expect(res.status).toBe(400);
  });

  it('rejects missing job id with 400', async () => {
    const res = await PUT(makeContext('', { 'x-internal-token': 'test-token' }, { status: 'applied' }));
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric job id with 400', async () => {
    const res = await PUT(makeContext('abc', { 'x-internal-token': 'test-token' }, { status: 'applied' }));
    expect(res.status).toBe(400);
  });

  it('updates status and returns updated job', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { id: 1, company: 'Acme', role_title: 'Dev', status: 'applied', updated_at: '2026-09-19T14:00:00Z' },
      ],
    } as never);
    const res = await PUT(makeContext('1', { 'x-internal-token': 'test-token' }, { status: 'applied' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.status).toBe('applied');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE applications.jobs'),
      [1, 'applied'],
    );
  });

  it('rejects invalid job id with 404 via empty result', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const res = await PUT(makeContext('999', { 'x-internal-token': 'test-token' }, { status: 'applied' }));
    expect(res.status).toBe(404);
  });

  it('accepts all valid statuses', async () => {
    const validStatuses = ['found', 'drafting', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];
    for (const status of validStatuses) {
      vi.mocked(pool.query).mockResolvedValue({
        rows: [{ id: 1, company: 'Test', role_title: 'Dev', status, updated_at: '2026-09-19T14:00:00Z' }],
      } as never);
      const res = await PUT(makeContext('1', { 'x-internal-token': 'test-token' }, { status }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe(status);
    }
  });
});
