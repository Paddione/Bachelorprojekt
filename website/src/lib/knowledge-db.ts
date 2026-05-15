import { Pool } from 'pg';
import { resolve4 } from 'dns';
import { embedQuery, type EmbeddingModel } from './embeddings';

export class MixedEmbeddingModelError extends Error {
  constructor(models: string[]) {
    super(`MixedEmbeddingModelError: collections span multiple embedding models (${models.join(', ')}); cross-space queries are not allowed`);
    this.name = 'MixedEmbeddingModelError';
  }
}

// musl libc's getaddrinfo opens a connected UDP socket which drops CoreDNS
// responses after kube-proxy DNAT. Node's dns.resolve4 uses an unconnected
// socket and is unaffected — mirrors website-db.ts.
function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

let _pool: Pool | null = null;
function p(): Pool {
  if (!_pool) {
    const connectionString = process.env.SESSIONS_DATABASE_URL
      || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';
    _pool = new Pool({ connectionString, lookup: nodeLookup } as unknown as import('pg').PoolConfig);
  }
  return _pool;
}

export function __setPoolForTests(testPool: Pool): void { _pool = testPool; }

export type CollectionSource = 'pr_history' | 'specs_plans' | 'claude_md' | 'bug_tickets' | 'custom';

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
}

export interface Document {
  id: string;
  collection_id: string;
  title: string;
  source_uri: string | null;
  raw_text: string;
  sha256: string | null;
}

export interface ChunkInput { position: number; text: string; embedding: number[]; }

export async function listCollections(): Promise<Collection[]> {
  const r = await p().query(
    `SELECT id, name, description, source, brand, chunk_count,
            last_indexed_at, embedding_model, created_at
       FROM knowledge.collections
      ORDER BY source, name`,
  );
  return r.rows;
}

export async function getCollection(id: string): Promise<Collection | null> {
  const r = await p().query(
    `SELECT id, name, description, source, brand, chunk_count,
            last_indexed_at, embedding_model, created_at
       FROM knowledge.collections WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function createCollection(args: {
  name: string; source: CollectionSource; description?: string; brand?: string | null;
  createdBy?: string | null; embeddingModel?: EmbeddingModel;
}): Promise<Collection> {
  const model: EmbeddingModel = args.embeddingModel
    ?? (process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2');
  const r = await p().query(
    `INSERT INTO knowledge.collections (name, source, description, brand, created_by, embedding_model)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, description, source, brand, chunk_count,
               last_indexed_at, embedding_model, created_at`,
    [args.name, args.source, args.description ?? null, args.brand ?? null, args.createdBy ?? null, model],
  );
  return r.rows[0];
}

export async function deleteCollection(id: string): Promise<void> {
  const c = await getCollection(id);
  if (!c) throw new Error('not_found');
  if (c.source !== 'custom') throw new Error('cannot delete non-custom collection');
  await p().query('DELETE FROM knowledge.collections WHERE id = $1', [id]);
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

export interface NearestChunk {
  id: string;
  text: string;
  collection_id: string;
  document_id: string;
  score: number;
  bookTitle: string | null;
  collectionName: string;
  page: number | null;
}

export async function queryNearest(args: {
  collectionIds: string[]; queryText: string; limit?: number; threshold?: number; signal?: AbortSignal;
}): Promise<NearestChunk[]> {
  const limit  = args.limit     ?? 6;
  const thresh = args.threshold ?? 0.65;

  if (args.collectionIds.length === 0) return [];

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
  return r.rows
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
