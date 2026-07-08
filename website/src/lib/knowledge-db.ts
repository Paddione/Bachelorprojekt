import { Pool } from 'pg';
import { embedQuery, type EmbeddingModel } from './embeddings';
import { logAiCall } from './ai-metrics';
import { pool as defaultPool } from './db-pool';

export class MixedEmbeddingModelError extends Error {
  constructor(models: string[]) {
    super(`MixedEmbeddingModelError: collections span multiple embedding models (${models.join(', ')}); cross-space queries are not allowed`);
    this.name = 'MixedEmbeddingModelError';
  }
}

// Test-only escape hatch: tests in knowledge-db.test.ts mocken den Pool per pg-mem.
// In Produktion wird ausschließlich `defaultPool` (aus db-pool.ts) verwendet — der
// gehärtete Pool liefert nodeLookup DNS-Workaround + fail-soft Timeouts.
let _pool: Pool | undefined;
export function __setPoolForTests(testPool: Pool): void { _pool = testPool; }
function p(): Pool { return _pool ?? defaultPool; }

export type CollectionSource = 'pr_history' | 'specs_plans' | 'claude_md' | 'bug_tickets' | 'custom' | 'web_crawl' | 'context7_docs';

export interface CrawlConfig {
  startUrl: string;
  maxDepth?: number;
  maxPages?: number;
  includePattern?: string;
  userAgent?: string;
}

export interface Context7Config {
  libraryId: string;
  tokens?: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  source: CollectionSource;
  brand: string | null;
  chunk_count: number;
  last_indexed_at: Date | null;
  embedding_model: string;
  created_at: Date;
  crawl_config: CrawlConfig | null;
}

interface Document {
  id: string;
  collection_id: string;
  title: string;
  source_uri: string | null;
  raw_text: string;
  sha256: string | null;
}

interface ChunkInput { position: number; text: string; embedding: number[]; }

export async function listCollections(): Promise<Collection[]> {
  const r = await p().query(
    `SELECT id, name, description, source, brand, chunk_count,
            last_indexed_at, embedding_model, created_at, crawl_config
       FROM knowledge.collections
      ORDER BY source, name`,
  );
  return r.rows;
}

export async function getCollection(id: string): Promise<Collection | null> {
  const r = await p().query(
    `SELECT id, name, description, source, brand, chunk_count,
            last_indexed_at, embedding_model, created_at, crawl_config
       FROM knowledge.collections WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function createCollection(args: {
  name: string; source: CollectionSource; description?: string; brand?: string | null;
  createdBy?: string | null; embeddingModel?: EmbeddingModel; crawlConfig?: CrawlConfig | null;
}): Promise<Collection> {
  const model: EmbeddingModel = args.embeddingModel
    ?? (process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2');
  const r = await p().query(
    `INSERT INTO knowledge.collections (name, source, description, brand, created_by, embedding_model, crawl_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, name, description, source, brand, chunk_count,
               last_indexed_at, embedding_model, created_at, crawl_config`,
    [
      args.name, args.source, args.description ?? null, args.brand ?? null,
      args.createdBy ?? null, model,
      args.crawlConfig ? JSON.stringify(args.crawlConfig) : null,
    ],
  );
  return r.rows[0];
}

export async function deleteCollection(id: string): Promise<void> {
  const c = await getCollection(id);
  if (!c) throw new Error('not_found');
  if (c.source !== 'custom' && c.source !== 'web_crawl' && c.source !== 'context7_docs')
    throw new Error('cannot delete non-custom collection');
  await p().query('DELETE FROM knowledge.collections WHERE id = $1', [id]);
}

export async function updateContext7Config(id: string, config: Context7Config): Promise<void> {
  const result = await p().query(
    `UPDATE knowledge.collections SET crawl_config = $2::jsonb WHERE id = $1`,
    [id, JSON.stringify(config)],
  );
  if (result.rowCount === 0) throw new Error('not_found');
}

export async function updateCrawlConfig(id: string, config: CrawlConfig): Promise<void> {
  const result = await p().query(
    `UPDATE knowledge.collections SET crawl_config = $2::jsonb WHERE id = $1`,
    [id, JSON.stringify(config)],
  );
  if (result.rowCount === 0) throw new Error('not_found');
}

export async function addDocument(args: {
  collectionId: string; title: string; sourceUri: string | null; rawText: string;
  sha256?: string | null; metadata?: Record<string, unknown>;
}): Promise<Document> {
  const r = await p().query(
    `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (collection_id, source_uri) DO UPDATE
       SET title = EXCLUDED.title,
           raw_text = EXCLUDED.raw_text,
           sha256 = EXCLUDED.sha256,
           metadata = EXCLUDED.metadata
     RETURNING id, collection_id, title, source_uri, raw_text, sha256`,
    [args.collectionId, args.title, args.sourceUri, args.rawText, args.sha256 ?? null,
     JSON.stringify(args.metadata ?? {})],
  );
  return r.rows[0];
}

function vecLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

export async function upsertChunks(collectionId: string, documentId: string, chunks: ChunkInput[]): Promise<void> {
  const client = p();
  await client.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [documentId]);
  for (const ch of chunks) {
    await client.query(
      `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, collectionId, ch.position, ch.text, vecLiteral(ch.embedding)],
    );
  }
}

export async function recountChunks(collectionId: string): Promise<void> {
  await p().query(
    `UPDATE knowledge.collections
        SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
            last_indexed_at = now()
      WHERE id = $1`,
    [collectionId],
  );
}

interface NearestChunk {
  id: string;
  text: string;
  collection_id: string;
  document_id: string;
  score: number;
  bookTitle: string | null;
  collectionName: string;
  page: number | null;
}

interface OpenspecHit {
  slug: string;
  ticket_id: string | null;
  section_title: string | null;
  file_type: string | null;
  snippet: string;
  similarity: number;
}

export async function searchOpenspec(args: {
  query: string; limit?: number; status?: string; signal?: AbortSignal;
}): Promise<OpenspecHit[]> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
  const colRes = await p().query(
    `SELECT id, embedding_model FROM knowledge.collections WHERE source = 'specs_plans' LIMIT 1`,
  );
  if (colRes.rows.length === 0) return [];
  const { id: collectionId, embedding_model } = colRes.rows[0];
  const { embedding } = await embedQuery(args.query, {
    model: embedding_model as EmbeddingModel, purpose: 'query', signal: args.signal,
  });
  const params: unknown[] = [vecLiteral(embedding), collectionId];
  let statusClause = '';
  if (args.status) { params.push(args.status); statusClause = ` AND kc.metadata->>'status' = $${params.length}`; }
  params.push(limit);
  const r = await p().query(
    `SELECT kc.metadata->>'slug' AS slug,
            kc.metadata->>'ticket_id' AS ticket_id,
            kc.metadata->>'section_title' AS section_title,
            kc.metadata->>'file_type' AS file_type,
            left(kc.text, 240) AS snippet,
            1 - (kc.embedding <=> $1) AS similarity
       FROM knowledge.chunks kc
      WHERE kc.collection_id = $2${statusClause}
      ORDER BY kc.embedding <=> $1
      LIMIT $${params.length}`,
    params,
  );
  return r.rows;
}

export async function queryNearest(args: {
  collectionIds: string[]; queryText: string; limit?: number; threshold?: number; signal?: AbortSignal;
}): Promise<NearestChunk[]> {
  const limit  = args.limit     ?? 6;
  const thresh = args.threshold ?? 0.65;

  if (args.collectionIds.length === 0) return [];
  const _start = Date.now();

  const placeholders = args.collectionIds.map((_, i) => `$${i + 1}`).join(',');
  const modelsRes = await p().query(
    `SELECT DISTINCT embedding_model FROM knowledge.collections WHERE id IN (${placeholders})`,
    args.collectionIds,
  );
  const models = modelsRes.rows.map((r: { embedding_model: string }) => r.embedding_model);
  if (models.length > 1) throw new MixedEmbeddingModelError(models);
  if (models.length === 0) return [];

  const { embedding } = await embedQuery(args.queryText, {
    model: models[0] as EmbeddingModel,
    purpose: 'query',
    signal: args.signal,
  });

  const r = await p().query(
    `SELECT kc.id, kc.text, kc.collection_id, kc.document_id,
            1 - (kc.embedding <=> $1) AS score,
            cb.title AS book_title,
            col.name AS collection_name,
            (kc.metadata->>'page')::int AS page
       FROM knowledge.chunks kc
       JOIN knowledge.collections col ON col.id = kc.collection_id
       LEFT JOIN coaching.books cb ON cb.knowledge_collection_id = kc.collection_id
      WHERE kc.collection_id = ANY($2::uuid[])
      ORDER BY kc.embedding <=> $1
      LIMIT $3`,
    [vecLiteral(embedding), args.collectionIds, limit],
  );
  const chunks = r.rows
    .filter((row: { score: number }) => row.score >= thresh)
    .map((row: { id: string; text: string; collection_id: string; document_id: string; score: number; book_title: string | null; collection_name: string; page: number | null }) => ({
      id: row.id,
      text: row.text,
      collection_id: row.collection_id,
      document_id: row.document_id,
      score: row.score,
      bookTitle: row.book_title,
      collectionName: row.collection_name,
      page: row.page,
    }));
  void logAiCall({
    workflow: 'rag_search',
    latencyMs: Date.now() - _start,
    metadata: { chunk_count: chunks.length, threshold: thresh, collection_count: args.collectionIds.length },
  });
  return chunks;
}

export async function mergeCollections(args: {
  sourceIds: string[];
  name: string;
  description?: string;
  brand?: string | null;
}): Promise<Collection> {
  if (args.sourceIds.length < 2) throw new Error('mindestens 2 Quellen erforderlich');
  if (!args.name.trim()) throw new Error('name erforderlich');

  const client = await p().connect();
  try {
    await client.query('BEGIN');

    const srcPlaceholders = args.sourceIds.map((_, i) => `$${i + 1}`).join(',');
    const srcRes = await client.query<{ id: string; name: string; source: string; embedding_model: string }>(
      `SELECT id, name, source, embedding_model FROM knowledge.collections WHERE id IN (${srcPlaceholders})`,
      args.sourceIds,
    );
    if (srcRes.rows.length !== args.sourceIds.length) throw new Error('not_found');

    for (const row of srcRes.rows) {
      if (row.source !== 'custom' && row.source !== 'web_crawl') {
        throw new Error(`cannot_delete: ${row.name}`);
      }
    }

    const models = [...new Set(srcRes.rows.map(r => r.embedding_model))];
    if (models.length > 1) throw new MixedEmbeddingModelError(models);

    const newColRes = await client.query<Collection>(
      `INSERT INTO knowledge.collections (name, source, description, brand, embedding_model)
       VALUES ($1, 'custom', $2, $3, $4)
       RETURNING id, name, description, source, brand, chunk_count,
                 last_indexed_at, embedding_model, created_at, crawl_config`,
      [args.name.trim(), args.description ?? null, args.brand ?? null, models[0]],
    );
    const newCol = newColRes.rows[0];

    for (const srcId of args.sourceIds) {
      const docsRes = await client.query<{ id: string; title: string; source_uri: string | null; raw_text: string; sha256: string | null; metadata: unknown }>(
        `SELECT id, title, source_uri, raw_text, sha256, metadata
           FROM knowledge.documents WHERE collection_id = $1`,
        [srcId],
      );
      for (const doc of docsRes.rows) {
        const newDocRes = await client.query<{ id: string }>(
          `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [newCol.id, doc.title, doc.source_uri, doc.raw_text, doc.sha256 ?? null,
           JSON.stringify(doc.metadata ?? {})],
        );
        const newDocId = newDocRes.rows[0].id;

        await client.query(
          `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
           SELECT $1, $2, position, text, embedding, metadata
             FROM knowledge.chunks WHERE document_id = $3`,
          [newDocId, newCol.id, doc.id],
        );
      }
    }

    await client.query(
      `UPDATE knowledge.collections
          SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
              last_indexed_at = now()
        WHERE id = $1`,
      [newCol.id],
    );

    const delPlaceholders = args.sourceIds.map((_, i) => `$${i + 1}`).join(',');
    await client.query(
      `DELETE FROM coaching.books WHERE knowledge_collection_id IN (${delPlaceholders})`,
      args.sourceIds,
    ).catch(() => {});

    await client.query(
      `DELETE FROM knowledge.collections WHERE id IN (${delPlaceholders})`,
      args.sourceIds,
    );

    await client.query('COMMIT');

    const refreshed = await p().query<Collection>(
      `SELECT id, name, description, source, brand, chunk_count,
              last_indexed_at, embedding_model, created_at, crawl_config
         FROM knowledge.collections WHERE id = $1`,
      [newCol.id],
    );
    return refreshed.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface SuggestSpec {
  name: string;
  sourceIds: string[];
}

export async function clusterByEmbedding(threshold = 0.75): Promise<SuggestSpec[]> {
  const pairsRes = await p().query<{ id_a: string; id_b: string; name_a: string; name_b: string }>(
    `WITH centroids AS (
       SELECT kc.collection_id, avg(kc.embedding) AS centroid
       FROM knowledge.chunks kc
       JOIN knowledge.collections col ON col.id = kc.collection_id
       WHERE col.source IN ('custom', 'web_crawl')
       GROUP BY kc.collection_id
       HAVING COUNT(*) > 0
     )
     SELECT
       a.collection_id AS id_a,
       col_a.name AS name_a,
       b.collection_id AS id_b,
       col_b.name AS name_b
     FROM centroids a
     JOIN centroids b ON a.collection_id < b.collection_id
     JOIN knowledge.collections col_a ON col_a.id = a.collection_id
     JOIN knowledge.collections col_b ON col_b.id = b.collection_id
     WHERE (1 - (a.centroid <=> b.centroid)) > $1
     ORDER BY (1 - (a.centroid <=> b.centroid)) DESC`,
    [threshold],
  );

  // union-find to cluster pairs into groups
  const parent = new Map<string, string>();
  const names = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) { parent.set(x, x); return x; }
    const p = find(parent.get(x)!);
    parent.set(x, p);
    return p;
  }
  function union(a: string, b: string) {
    parent.set(find(b), find(a));
  }

  for (const { id_a, id_b, name_a, name_b } of pairsRes.rows) {
    names.set(id_a, name_a);
    names.set(id_b, name_b);
    union(id_a, id_b);
  }

  const groups = new Map<string, string[]>();
  for (const id of Array.from(names.keys())) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }

  return Array.from(groups.values())
    .filter(ids => ids.length >= 2)
    .map(ids => {
      const sorted = ids.slice().sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? ''));
      const baseName = names.get(sorted[0]) ?? 'Zusammengeführt';
      return { name: baseName, sourceIds: sorted };
    });
}

export async function ensureCollection(args: {
  name: string;
  source: CollectionSource;
  brand?: string | null;
  description?: string | null;
}): Promise<Collection> {
  const all = await listCollections();
  const found = all.find((c) => c.name === args.name);
  if (found) return found;
  return createCollection({
    name: args.name,
    source: args.source,
    description: args.description ?? undefined,
    brand: args.brand ?? null,
  });
}
