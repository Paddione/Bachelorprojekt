// website/src/lib/codesearch-db.ts
// Shared `pool` aus website/src/lib/db-pool.ts (gehärtet: nodeLookup DNS-Workaround +
// fail-soft Connection-/Statement-Timeouts). Eigener Ad-hoc-Pool entfernt —
// siehe T001676 Stufe C1.
import pg from 'pg';
import { lookup as dnsLookup } from 'node:dns/promises';
import { pool as defaultPool } from './db-pool';

// Test-only escape hatch: tests in codesearch-db.test.ts mocken den Pool per pg-mem.
// In Produktion wird ausschließlich `defaultPool` (aus db-pool.ts) verwendet.
let _pool: pg.Pool | undefined;
export function __setPoolForTests(testPool: pg.Pool): void { _pool = testPool; }
function p(): pg.Pool { return _pool ?? defaultPool; }

const EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? 'text-embedding-bge-m3';

// `task scs:search` and local dev shells run outside the cluster, where
// llm-gateway-lmstudio's DNS never resolves. Resolve once and cache — falls
// back to the local dev stack (LM Studio direct on :1234) instead of hanging.
let _embedUrlPromise: Promise<string> | undefined;
async function resolveEmbedUrl(): Promise<string> {
  if (process.env.LLM_EMBED_URL) return process.env.LLM_EMBED_URL;
  if (!_embedUrlPromise) {
    const clusterHost = 'llm-gateway-lmstudio.workspace.svc.cluster.local';
    _embedUrlPromise = dnsLookup(clusterHost)
      .then(() => `http://${clusterHost}:1234`)
      .catch(() => 'http://localhost:1234');
  }
  return _embedUrlPromise;
}

function vecLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function embedQueryText(text: string): Promise<number[]> {
  const embedUrl = await resolveEmbedUrl();
  const r = await fetch(`${embedUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'query' },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text] }),
  });
  if (!r.ok) {
    const err = new Error(`embedding service unavailable: ${r.status}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  const j = await r.json() as { data: Array<{ embedding: number[] }> };
  return j.data[0].embedding;
}

export interface CodeSearchResult {
  path: string;
  score: number;
  snippet: string;
  chunk_index: number;
}

export async function searchCode(query: string, limit = 5): Promise<CodeSearchResult[]> {
  const embedding = await embedQueryText(query);
  const r = await p().query(
    `SELECT file_path, chunk_index, content,
            1 - (embedding <=> $1) AS score
       FROM code_embeddings
      ORDER BY embedding <=> $1
      LIMIT $2`,
    [vecLiteral(embedding), limit],
  );
  return r.rows.map((row: { file_path: string; chunk_index: number; content: string; score: number }) => ({
    path: row.file_path,
    score: Number(row.score),
    snippet: row.content.slice(0, 300),
    chunk_index: row.chunk_index,
  }));
}

export async function searchCodeAugmented(query: string, limit = 5): Promise<CodeSearchResult[]> {
  const initial = await searchCode(query, limit);
  if (initial.length === 0) return initial;

  const paths = initial.map(r => r.path);
  const neighbors = await p().query(
    `SELECT DISTINCT to_path AS path FROM file_dependencies WHERE from_path = ANY($1)
     UNION
     SELECT DISTINCT from_path AS path FROM file_dependencies WHERE to_path = ANY($1)`,
    [paths],
  );

  const existingPaths = new Set(paths);
  const augmented: CodeSearchResult[] = [...initial];

  const neighborPaths = neighbors.rows
    .map((row: { path: string }) => row.path)
    .filter((p: string) => !existingPaths.has(p));
  if (neighborPaths.length === 0) return augmented;

  // Batch-Lookup statt per-row Query: ein einzelner SELECT für alle Nachbar-Pfade.
  // T001676 N+1-Audit: ersetzt die vorherige for-Schleife mit await p().query() per row.
  const chunkRes = await p().query<{ file_path: string; chunk_index: number; content: string }>(
    `SELECT DISTINCT ON (file_path) file_path, chunk_index, content
       FROM code_embeddings
      WHERE file_path = ANY($1::text[])
      ORDER BY file_path, chunk_index
      LIMIT $2`,
    [neighborPaths, limit * 2 - augmented.length],
  );
  for (const row of chunkRes.rows) {
    if (augmented.length >= limit * 2) break;
    augmented.push({
      path: row.file_path,
      score: 0.7,
      snippet: row.content.slice(0, 300),
      chunk_index: row.chunk_index,
    });
  }

  return augmented;
}
