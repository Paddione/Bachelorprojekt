// website/src/lib/qa-ingest.test.ts [T000730]
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a), connect: vi.fn() },
}));
vi.mock('./knowledge-db', () => ({ MixedEmbeddingModelError: class {} }));

import { closeQaTicketsBySlug, type E2ETestResult } from './qa-ingest';

const PASS: E2ETestResult = { testId: '[my-slug] foo', status: 'pass' };
const FAIL: E2ETestResult = { testId: '[my-slug] bar', status: 'fail' };
const NO_SLUG: E2ETestResult = { testId: 'Generic test', status: 'pass' };

describe('closeQaTicketsBySlug', () => {
  beforeEach(() => query.mockReset());

  it('sets status=done when all tests for a slug pass', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-1', external_id: 'T000999', slug_key: 'my-slug' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const closed = await closeQaTicketsBySlug([PASS]);
    expect(closed).toEqual(['T000999']);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'done'"),
      expect.arrayContaining(['uuid-1']),
    );
  });

  it('leaves ticket on qa_review when any test for its slug fails', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-2', external_id: 'T000888', slug_key: 'my-slug' }],
    });
    const closed = await closeQaTicketsBySlug([PASS, FAIL]);
    expect(closed).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('ignores test results with no [slug] prefix', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const closed = await closeQaTicketsBySlug([NO_SLUG]);
    expect(closed).toEqual([]);
  });

  it('returns empty array when no qa_review tickets exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const closed = await closeQaTicketsBySlug([PASS]);
    expect(closed).toEqual([]);
  });

  it('fails closed (empty) when DB throws', async () => {
    query.mockRejectedValueOnce(new Error('DB down'));
    const closed = await closeQaTicketsBySlug([PASS]);
    expect(closed).toEqual([]);
  });

  it('activates feature flag after closing ticket', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-3', external_id: 'T000777', slug_key: 'my-slug' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });
    await closeQaTicketsBySlug([PASS]);
    const calls = query.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((sql) => sql.includes('feature_flags'))).toBe(true);
  });
});
