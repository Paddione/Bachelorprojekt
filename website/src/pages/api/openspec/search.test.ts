import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the lib function the route depends on.
vi.mock('../../../lib/knowledge-db', () => ({
  searchOpenspec: vi.fn(),
}));

import { GET } from './search';
import { searchOpenspec } from '../../../lib/knowledge-db';

function req(qs: string) {
  return {
    url: new URL(`http://x/api/openspec/search?${qs}`),
    request: new Request(`http://x/api/openspec/search?${qs}`),
    locals: { requestLogger: { error: () => {} } },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/openspec/search', () => {
  it('400 when q is missing', async () => {
    const res = await GET(req('limit=5'));
    expect(res.status).toBe(400);
  });

  it('returns the top match for a query', async () => {
    (searchOpenspec as any).mockResolvedValue([
      { slug: 'openspec-pgvector', ticket_id: 'T001008', section_title: 'Write-Pfad',
        file_type: 'task_section', snippet: 'Standalone Node.js ESM-Script', similarity: 0.91 },
    ]);
    const res = await GET(req('q=embedding%20indexierung&limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].slug).toBe('openspec-pgvector');
    expect(body.results[0].similarity).toBeGreaterThan(0.9);
    expect((searchOpenspec as any).mock.calls[0][0]).toMatchObject({ query: 'embedding indexierung', limit: 3 });
  });

  it('clamps limit to max 20 and passes status filter', async () => {
    (searchOpenspec as any).mockResolvedValue([]);
    await GET(req('q=foo&limit=999&status=plan_staged'));
    const arg = (searchOpenspec as any).mock.calls[0][0];
    expect(arg.limit).toBe(20);
    expect(arg.status).toBe('plan_staged');
  });

  it('503 when the embedding service is unavailable', async () => {
    (searchOpenspec as any).mockRejectedValue(Object.assign(new Error('router 503'), { status: 503 }));
    const res = await GET(req('q=embedding'));
    expect(res.status).toBe(503);
  });
});
