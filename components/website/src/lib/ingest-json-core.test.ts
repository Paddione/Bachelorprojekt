import { describe, it, expect, vi, beforeEach } from 'vitest';

const embedBatch = vi.fn();
vi.mock('./embeddings', () => ({
  embedBatch: (...a: unknown[]) => embedBatch(...a),
}));

import { validateJsonEntries, ingestJsonChunks, presplitJsonText } from './ingest-json-core';

beforeEach(() => embedBatch.mockReset());

const VEC = () => Array(768).fill(0.01);

function mockPool({ gate = true }: { gate?: boolean } = {}) {
  const q = vi.fn(async (sql: string, _params?: unknown) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('dense_embedding_migrations')) {
      return gate
        ? { rows: [{ writer_locked: false, phase: 'active', target_profile: 'embeddinggemma-300m:768:Q8_0:v1' }] }
        : { rows: [] };
    }
    if (sql.includes('FROM knowledge.collections')) return { rows: [{ id: 'col-1' }] };
    if (sql.includes('INSERT INTO knowledge.collections')) return { rows: [{ id: 'col-2' }] };
    if (sql.includes('INSERT INTO knowledge.documents')) return { rows: [{ id: 'doc-1' }] };
    return { rows: [] };
  });
  const client = { query: (...a: [string, unknown?]) => q(a[0], a[1]), release: vi.fn() };
  const pool = { query: (...a: [string, unknown?]) => q(a[0], a[1]), connect: async () => client };
  return { q, pool, client };
}

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

describe('ingest-json-core.presplitJsonText', () => {
  it('keeps short text whole and never splits surrogates', () => {
    expect(presplitJsonText('hi')).toEqual(['hi']);
    const parts = presplitJsonText(`${'x'.repeat(2999)}😀rest`);
    expect(parts.join('')).toBe(`${'x'.repeat(2999)}😀rest`);
    for (const p of parts) expect(p).not.toMatch(/�/);
  });
});

describe('ingest-json-core.ingestJsonChunks (db-mocked)', () => {
  it('reuses the existing collection and sets the Gemma label only at commit', async () => {
    const { q, pool } = mockPool();
    embedBatch.mockResolvedValue({ embeddings: [VEC()] });

    const out = await ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: 'hi' }], slug: 'kb1', sourceUri: 'file://x' },
      () => undefined,
    );
    expect(out).toEqual({ collectionId: 'col-1', count: 1 });
    const calls = q.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toMatch(/dense_embedding_migrations/);
    expect(calls[1]).toBe('BEGIN');
    expect(calls.at(-1)).toBe('COMMIT');
    const labelCall = q.mock.calls.find((c) => String(c[0]).includes('embedding_model'));
    expect(String(labelCall?.[0])).toMatch(/UPDATE knowledge\.collections/);
  });

  it('creates a new collection with the Gemma label inside the transaction', async () => {
    const q = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('dense_embedding_migrations')) {
        return { rows: [{ writer_locked: false, phase: 'active', target_profile: 'embeddinggemma-300m:768:Q8_0:v1' }] };
      }
      if (sql.includes('FROM knowledge.collections')) return { rows: [] };
      if (sql.includes('INSERT INTO knowledge.collections')) {
        return { rows: [{ id: 'col-2' }] };
      }
      if (sql.includes('INSERT INTO knowledge.documents')) return { rows: [{ id: 'doc-2' }] };
      return { rows: [] };
    });
    const client = { query: (...a: [string]) => q(...a), release: vi.fn() };
    const pool = { query: (...a: [string]) => q(...a), connect: async () => client };
    embedBatch.mockResolvedValue({ embeddings: [VEC()] });

    const out = await ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: 'hi' }], slug: 'new', sourceUri: 'file://y' },
      () => undefined,
    );
    expect(out.collectionId).toBe('col-2');
    const insertCall = q.mock.calls.find((c) => String(c[0]).includes('INSERT INTO knowledge.collections')) as
      unknown as [string, unknown[]] | undefined;
    expect(insertCall?.[1]).toMatchObject(['new', 'embeddinggemma-300m', null]);
  });

  it('emits source_id/part provenance with consistent positions', async () => {
    const { q, pool } = mockPool();
    embedBatch.mockResolvedValue({ embeddings: [VEC(), VEC()] });

    await ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: '1' }, { id: 'b', content: '2' }], slug: 's', sourceUri: 'u' },
      () => undefined,
    );
    const inserts = q.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO knowledge.chunks')) as
      unknown as Array<[string, unknown[]]>;
    expect(inserts).toHaveLength(2);
    expect(JSON.parse(String(inserts[1][1][5]))).toMatchObject({ source_id: 'b', part_index: 0 });
  });

  it('rolls back fully on upstream errors, label untouched', async () => {
    const seen: string[] = [];
    const cq = vi.fn(async (sql: string) => {
      seen.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('dense_embedding_migrations')) {
        return { rows: [{ writer_locked: false, phase: 'active', target_profile: 'embeddinggemma-300m:768:Q8_0:v1' }] };
      }
      if (sql.includes('FROM knowledge.collections')) return { rows: [{ id: 'col-1' }] };
      if (sql.includes('INSERT INTO knowledge.documents')) return { rows: [{ id: 'doc-1' }] };
      return { rows: [] };
    });
    const cclient = { query: (s: string) => cq(s), release: () => undefined };
    const cpool = { query: (s: string) => cq(s), connect: async () => cclient };
    embedBatch.mockRejectedValueOnce(new Error('upstream 400'));

    let caught: unknown = null;
    try {
      await ingestJsonChunks(
        cpool as never,
        { entries: [{ id: 'a', content: 'hi' }], slug: 's', sourceUri: 'u' },
        () => undefined,
      );
    } catch (e) {
      caught = e;
    }
    expect(String((caught as Error | null)?.message ?? '')).toMatch(/upstream 400/);
    expect(seen).toContain('ROLLBACK');
    expect(seen).not.toContain('COMMIT');
    expect(seen.join('\n')).not.toMatch(/UPDATE knowledge\.collections/);
  });

  it('fail-closed ohne aktive Generation', async () => {
    const { q, pool } = mockPool({ gate: false });
    embedBatch.mockResolvedValue({ embeddings: [VEC()] });

    await expect(ingestJsonChunks(
      pool as never,
      { entries: [{ id: 'a', content: 'hi' }], slug: 's', sourceUri: 'u' },
      () => undefined,
    )).rejects.toThrow(/DenseProfileError/);
    expect(q.mock.calls.map((c) => String(c[0]))).not.toContain('BEGIN');
  });
});
