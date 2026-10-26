import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── pg mock (must be hoisted before any pool import) ──────────────────────
let poolQuery: ReturnType<typeof vi.fn>;
type TestGlobals = {
  __pgMock?: { poolQuery: ReturnType<typeof vi.fn> };
  __embeddingsMock?: { embedBatch: ReturnType<typeof vi.fn>; embedQuery: ReturnType<typeof vi.fn> };
};
vi.mock('pg', () => {
  const _poolQuery = vi.fn();
  function Pool(this: { query: ReturnType<typeof vi.fn>; connect: () => Promise<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> }) {
    this.query = _poolQuery;
    this.connect = async () => ({ query: _poolQuery, release: vi.fn() });
  }
  (globalThis as unknown as TestGlobals).__pgMock = { poolQuery: _poolQuery };
  return { default: { Pool }, Pool };
});

// ─── embeddings mock ────────────────────────────────────────────────────────
let embedBatch: ReturnType<typeof vi.fn>;
let embedQuery: ReturnType<typeof vi.fn>;
vi.mock('./embeddings', async (orig) => {
  const actual = await orig<typeof import('./embeddings.ts')>();
  const _embedBatch = vi.fn();
  const _embedQuery = vi.fn();
  (globalThis as unknown as TestGlobals).__embeddingsMock = { embedBatch: _embedBatch, embedQuery: _embedQuery };
  return { ...actual, embedBatch: _embedBatch, embedQuery: _embedQuery };
});

// ─── imports that depend on the mocks ──────────────────────────────────────
import { ticketEmbeddingModel } from './tickets-db';
import { embedTicket, findSimilarTickets, backfillTicketEmbeddings } from './tickets-embed';
import { MixedEmbeddingModelError } from './tickets-db';

beforeEach(() => {
  const g = globalThis as unknown as TestGlobals;
  poolQuery = g.__pgMock!.poolQuery;
  embedBatch = g.__embeddingsMock!.embedBatch;
  embedQuery = g.__embeddingsMock!.embedQuery;
  poolQuery.mockReset();
  embedBatch.mockReset();
  embedQuery.mockReset();
  process.env.LLM_ENABLED = 'true';
});

// ─── T2: ticketEmbeddingModel ───────────────────────────────────────────────
describe('ticketEmbeddingModel', () => {
  const prev = process.env.LLM_ENABLED;
  afterEach(() => { process.env.LLM_ENABLED = prev; });

  it('returns embeddinggemma-300m when LLM is enabled', () => {
    process.env.LLM_ENABLED = 'true';
    expect(ticketEmbeddingModel()).toBe('embeddinggemma-300m');
  });

  it('returns embeddinggemma-300m regardless of LLM flag (kein Fremdanbieter)', () => {
    process.env.LLM_ENABLED = 'false';
    expect(ticketEmbeddingModel()).toBe('embeddinggemma-300m');
  });
});

// ─── T3: embedTicket ────────────────────────────────────────────────────────
describe('embedTicket', () => {
  it('chunks, embeds and inserts one row per chunk tagged with model + chunk_type', async () => {
    embedBatch.mockResolvedValueOnce({ embeddings: [Array(768).fill(0.1)], tokens: 5 });
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const n = await embedTicket('uuid-1', { title: 'Add X', description: 'Body of the ticket' });

    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(n).toBeGreaterThanOrEqual(1);
    const insert = poolQuery.mock.calls.find((c: unknown[]) => /INSERT INTO tickets\.ticket_embeddings/.test(c[0] as string));
    expect(insert).toBeTruthy();
    expect(insert![0]).toMatch(/embedding_model/);
    // bound params include chunk_type 'summary' and model 'embeddinggemma-300m'
    expect(insert![1]).toEqual(expect.arrayContaining(['uuid-1', 'summary', 'embeddinggemma-300m']));
  });

  it('is best-effort: an EmbeddingIndexError does not throw to the caller', async () => {
    const { EmbeddingIndexError } = await import('./embeddings.ts');
    embedBatch.mockRejectedValueOnce(new EmbeddingIndexError('gpu down'));
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(embedTicket('uuid-2', { title: 'T', description: 'D' })).resolves.toBe(0);
  });
});

// ─── T4: findSimilarTickets ─────────────────────────────────────────────────
describe('findSimilarTickets', () => {
  it('embeds the query and returns rows ranked by fn_find_similar', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ embedding_model: 'embeddinggemma-300m' }] }); // DISTINCT model
    embedQuery.mockResolvedValueOnce({ embedding: Array(768).fill(0.2), tokens: 3 });
    poolQuery.mockResolvedValueOnce({ rows: [
      { ticket_id: 'u1', external_id: 'T000100', chunk: 'x', chunk_type: 'summary', similarity: 0.91 },
    ] });

    const res = await findSimilarTickets('add feature X', 5);
    expect(embedQuery).toHaveBeenCalledWith('add feature X', expect.objectContaining({ purpose: 'query', model: 'embeddinggemma-300m' }));
    expect(res[0].external_id).toBe('T000100');
  });

  it('throws MixedEmbeddingModelError when rows span >1 model', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ embedding_model: 'embeddinggemma-300m' }, { embedding_model: 'bge-m3' }] });
    await expect(findSimilarTickets('q', 5)).rejects.toBeInstanceOf(MixedEmbeddingModelError);
  });

  it('fail-closed auf altem BGE-Einzelbestand statt Cross-Space-Suche', async () => {
    const { DenseProfileError } = await import('./dense-embedding-guard.ts');
    poolQuery.mockResolvedValueOnce({ rows: [{ embedding_model: 'bge-m3' }] });
    await expect(findSimilarTickets('q', 5)).rejects.toBeInstanceOf(DenseProfileError);
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it('returns [] when there are no embeddings yet (fail-soft for Scout)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(findSimilarTickets('q', 5)).resolves.toEqual([]);
  });
});

// ─── T5: backfillTicketEmbeddings ──────────────────────────────────────────
describe('backfillTicketEmbeddings', () => {
  it('embeds only tickets lacking rows for the current model, idempotent on re-run', async () => {
    process.env.LLM_ENABLED = 'true';
    // 1st query: the candidate tickets (no embeddings yet)
    poolQuery.mockResolvedValueOnce({ rows: [
      { id: 'u1', title: 'A', description: 'a' },
      { id: 'u2', title: 'B', description: 'b' },
    ] });
    embedBatch.mockResolvedValue({ embeddings: [Array(768).fill(0.1)], tokens: 1 });
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // inserts

    const first = await backfillTicketEmbeddings({ batchSize: 50 });
    expect(first.embedded).toBe(2);

    // 2nd run: candidate query returns none (all already embedded)
    poolQuery.mockReset(); embedBatch.mockReset();
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const second = await backfillTicketEmbeddings({ batchSize: 50 });
    expect(second.embedded).toBe(0);
    expect(embedBatch).not.toHaveBeenCalled();
  });
});
