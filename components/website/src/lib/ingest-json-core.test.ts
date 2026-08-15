import { describe, it, expect, vi, beforeEach } from 'vitest';

const embedBatch = vi.fn();
vi.mock('./embeddings', () => ({
  embedBatch: (...a: unknown[]) => embedBatch(...a),
}));

import { validateJsonEntries, ingestJsonChunks } from './ingest-json-core';

beforeEach(() => embedBatch.mockReset());

describe('ingest-json-core.validateJsonEntries', () => {
  it('accepts an empty array', () => {
    expect(validateJsonEntries([])).toEqual([]);
  });

  it('rejects non-array input', () => {
    expect(() => validateJsonEntries(null)).toThrow(/array/);
    expect(() => validateJsonEntries({ a: 1 })).toThrow(/array/);
  });

  it('rejects entries without a string id', () => {
    expect(() => validateJsonEntries([{ content: 'x' }])).toThrow(/"id"/);
    expect(() => validateJsonEntries([{ id: 42, content: 'x' }])).toThrow(/"id"/);
    expect(() => validateJsonEntries([{ id: '', content: 'x' }])).toThrow(/"id"/);
  });

  it('rejects entries with empty / non-string content', () => {
    expect(() => validateJsonEntries([{ id: 'a' }])).toThrow(/"content"/);
    expect(() => validateJsonEntries([{ id: 'a', content: '   ' }])).toThrow(/"content"/);
    expect(() => validateJsonEntries([{ id: 'a', content: 99 }])).toThrow(/"content"/);
  });

  it('passes through valid entries (preserving metadata)', () => {
    const out = validateJsonEntries([
      { id: 'a', content: 'hello', metadata: { x: 1 } },
      { id: 'b', content: 'world' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'a', content: 'hello', metadata: { x: 1 } });
  });
});

describe('ingest-json-core.ingestJsonChunks (db-mocked)', () => {
  function mockPool() {
    const q = vi.fn();
    return { q, pool: { query: (...a: unknown[]) => q(...a) } };
  }

  it('reuses the existing collection when one matches the slug', async () => {
    const { q, pool } = mockPool();
    q
      .mockResolvedValueOnce({ rows: [{ id: 'col-1' }] })                  // SELECT existing collection
      .mockResolvedValueOnce({ rows: [] })                                  // UPDATE collection
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1' }] })                  // INSERT document
      .mockResolvedValueOnce({ rows: [] })                                  // DELETE old chunks
      .mockResolvedValueOnce({ rows: [] });                                 // UPDATE chunk_count

    embedBatch.mockResolvedValueOnce({ embeddings: [[0.1, 0.2, 0.3]] });

    const out = await ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: 'hi' }], slug: 'kb1', sourceUri: 'file://x' },
      () => undefined,
    );
    expect(out).toEqual({ collectionId: 'col-1', count: 1 });
    const updateSql = q.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/UPDATE knowledge\.collections/);
  });

  it('creates a new collection when the slug does not exist yet', async () => {
    const { q, pool } = mockPool();
    q
      .mockResolvedValueOnce({ rows: [] })                                  // SELECT existing (empty)
      .mockResolvedValueOnce({ rows: [{ id: 'col-2' }] })                  // INSERT new collection
      .mockResolvedValueOnce({ rows: [{ id: 'doc-2' }] })                  // INSERT document
      .mockResolvedValueOnce({ rows: [] })                                  // DELETE old chunks
      .mockResolvedValueOnce({ rows: [] });                                 // UPDATE chunk_count

    embedBatch.mockResolvedValueOnce({ embeddings: [[0.4, 0.5]] });
    const out = await ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: 'hi' }], slug: 'new', sourceUri: 'file://y' },
      () => undefined,
    );
    expect(out.collectionId).toBe('col-2');
    expect(out.count).toBe(1);
    const insertCol = q.mock.calls[1][0] as string;
    expect(insertCol).toMatch(/INSERT INTO knowledge\.collections/);
  });

  it('reports progress for every entry and returns the total count', async () => {
    const { q, pool } = mockPool();
    q
      .mockResolvedValueOnce({ rows: [{ id: 'col-3' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'doc-3' }] })
      .mockResolvedValueOnce({ rows: [] });

    embedBatch.mockResolvedValueOnce({ embeddings: [[0.1], [0.2]] });

    const progress: Array<[number, number]> = [];
    const out = await ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: '1' }, { id: 'b', content: '2' }], slug: 's', sourceUri: 'u' },
      (done, total) => progress.push([done, total]),
    );
    expect(out.count).toBe(2);
    expect(progress.at(-1)).toEqual([2, 2]);
  });
});
