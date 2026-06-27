import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchCode, searchCodeAugmented, __setPoolForTests } from './codesearch-db';

const queryMock = vi.fn();
const setPool = (__setPoolForTests as unknown as (p: unknown) => void);

const ORIGINAL_FETCH = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  queryMock.mockReset();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setPool({ query: (...a: unknown[]) => queryMock(...a) });
});
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('codesearch-db', () => {
  it('searchCode: embeds via /v1/embeddings + SELECT ORDER BY distance', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        { file_path: 'src/a.ts', chunk_index: 0, content: 'hello world', score: 0.91 },
        { file_path: 'src/b.ts', chunk_index: 2, content: 'a'.repeat(500), score: 0.75 },
      ],
    });
    // imported at top
    const out = await searchCode('auth');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ path: 'src/a.ts', score: 0.91, snippet: 'hello world', chunk_index: 0 });
    // Snippet is truncated to 300 chars
    expect(out[1].snippet).toHaveLength(300);
    // Embedding is sent as a Postgres array literal
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/FROM code_embeddings/);
    expect(sql).toMatch(/ORDER BY embedding <=> \$1/);
    expect((params[0] as string).startsWith('[')).toBe(true);
    expect(params[0]).toContain('0.1,0.2,0.3');
    expect(params[1]).toBe(5); // default limit
  });

  it('searchCode: throws with .status when the embedding service is unavailable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    // imported at top
    await expect(searchCode('x')).rejects.toMatchObject({ status: 503 });
  });

  it('searchCodeAugmented: returns the initial results when there are none', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1] }] }),
    });
    queryMock.mockResolvedValueOnce({ rows: [] });
    // imported at top
    const out = await searchCodeAugmented('q');
    expect(out).toEqual([]);
  });

  it('searchCodeAugmented: dedupes neighbor paths and caps at limit*2', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1] }] }),
    });
    queryMock
      .mockResolvedValueOnce({ rows: [{ file_path: 'src/a.ts', chunk_index: 0, content: 'a', score: 0.9 }] })
      .mockResolvedValueOnce({ rows: [
        { path: 'src/a.ts' },                       // duplicate of initial — should be skipped
        { path: 'src/b.ts' },
        { path: 'src/c.ts' },
        { path: 'src/d.ts' },
      ] })
      .mockResolvedValueOnce({ rows: [{ chunk_index: 0, content: 'b' }] })
      .mockResolvedValueOnce({ rows: [{ chunk_index: 0, content: 'c' }] })
      .mockResolvedValueOnce({ rows: [] }); // d.ts — empty → skip
    // imported at top
    const out = await searchCodeAugmented('q', 2);
    // initial 1 + at most limit*2 = 4 augmented items
    expect(out.length).toBeLessThanOrEqual(1 + 2 * 2);
    const paths = out.map(o => o.path);
    expect(new Set(paths).size).toBe(paths.length); // all unique
    expect(paths).toContain('src/a.ts');
  });
});
