// Ambient TypeScript declarations for lib-knowledge-pg.mjs.
// The .mjs file is the runtime source of truth; this file exists only so
// .mts/.ts callers (e.g. scripts/coaching/ingest-book.mts) get types.
// Pool is loosely typed because @types/pg lives in website/node_modules
// and isn't visible from project-root .mts files.

interface PgPool {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  end(): Promise<void>;
}

export function makePool(): PgPool;

export function sha256(s: string): string;

export interface EnsureCollectionArgs {
  name: string;
  source: string;
  brand?: string | null;
  description?: string | null;
}
export function ensureCollection(pool: PgPool, args: EnsureCollectionArgs): Promise<string>;

export interface UpsertChunk {
  position: number;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}
export interface UpsertDocumentArgs {
  collectionId: string;
  title: string;
  sourceUri: string;
  rawText: string;
  hash: string;
  metadata?: Record<string, unknown>;
  chunks: UpsertChunk[] | null;
}
export function upsertDocumentAndChunks(
  pool: PgPool,
  args: UpsertDocumentArgs,
): Promise<{ docId: string; reused: boolean }>;

export function bumpCollectionStats(pool: PgPool, collectionId: string): Promise<void>;

export function callVoyage(
  inputs: string[],
  inputType?: 'document' | 'query',
): Promise<{ embeddings: number[][]; tokens: number }>;

export function embedAll(texts: string[], batch?: number): Promise<number[][]>;

export interface PlainChunk {
  position: number;
  text: string;
}
export function chunkPlain(text: string, target?: number, overlap?: number): PlainChunk[];
