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
    // T002317: Die Vektorsuche holt bewusst MEHR als das angefragte Limit
    // (5 x RERANK_CANDIDATE_FACTOR = 40). Der Reranker kann nur umsortieren,
    // was die erste Stufe geliefert hat — ein zu enges SQL-LIMIT wuerde ihm
    // genau die Treffer vorenthalten, die er nach oben holen soll.
    expect(params[1]).toBe(40);
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

// T002317 — Reranking.
//
// Reine Vektor-Naehe rankt Dateien hoch, die fast nur aus sprechenden
// Bezeichnern bestehen. Gemessen am 2026-07-27 gewann fuer "svelte component
// for the admin ticket board" die reine ID-Konstantenliste
// website/src/lib/tickets/cockpit-ids.ts gegen die tatsaechlichen
// Admin-Komponenten. bge-reranker-v2-m3 sieht Query und Dokument gemeinsam
// und korrigiert solche Faelle.
describe('codesearch-db: reranking (T002317)', () => {
  it('sortiert die Vektor-Treffer nach dem Reranker-Score um', async () => {
    fetchMock.mockResolvedValueOnce({            // /v1/embeddings
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        { file_path: 'src/ids.ts', chunk_index: 0, content: 'const IDS = [...]', score: 0.90 },
        { file_path: 'src/Board.svelte', chunk_index: 0, content: '<script>board</script>', score: 0.80 },
      ],
    });
    fetchMock.mockResolvedValueOnce({            // /v1/rerank
      ok: true,
      json: async () => ({ results: [
        { index: 1, relevance_score: -2.1 },     // Board.svelte ist relevanter
        { index: 0, relevance_score: -9.7 },
      ] }),
    });

    const out = await searchCode('svelte board component', 2);
    // Der Reranker dreht die Reihenfolge gegenueber der Cosine-Sortierung um.
    expect(out.map(r => r.path)).toEqual(['src/Board.svelte', 'src/ids.ts']);
    expect(out[0].rerank_score).toBe(-2.1);
    // Der Cosine-Score bleibt unveraendert erhalten — nur die Reihenfolge aendert sich.
    expect(out[0].score).toBe(0.80);

    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.query).toBe('svelte board component');
    expect(body.documents).toHaveLength(2);
  });

  it('liefert das Vektor-Ranking, wenn der Reranker ausfaellt (fail-soft)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1] }] }),
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        { file_path: 'src/a.ts', chunk_index: 0, content: 'a', score: 0.9 },
        { file_path: 'src/b.ts', chunk_index: 0, content: 'b', score: 0.5 },
      ],
    });
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const out = await searchCode('x', 2);
    // Reihenfolge der Vektorsuche bleibt, kein rerank_score.
    expect(out.map(r => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(out[0].rerank_score).toBeUndefined();
  });

  it('respektiert das angefragte Limit nach dem Reranking', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [{ embedding: [0.1] }] }),
    });
    queryMock.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({
        file_path: `src/f${i}.ts`, chunk_index: 0, content: `c${i}`, score: 1 - i / 100,
      })),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: Array.from({ length: 10 }, (_, i) => ({
        index: 9 - i, relevance_score: -i,   // umgekehrte Reihenfolge
      })) }),
    });

    const out = await searchCode('x', 3);
    expect(out).toHaveLength(3);
    expect(out[0].path).toBe('src/f9.ts');
  });

  it('nutzt llm-gateway-embed und das Modell bge-m3 (T002317)', async () => {
    process.env.LLM_EMBED_URL = 'http://embed.test:8095';
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [{ embedding: [0.1] }] }),
    });
    queryMock.mockResolvedValueOnce({ rows: [] });

    await searchCode('x', 1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://embed.test:8095/v1/embeddings');
    expect(JSON.parse((init as { body: string }).body).model).toBe('bge-m3');
    delete process.env.LLM_EMBED_URL;
  });
});
