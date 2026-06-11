import { Pool } from 'pg';
import { resolve4 } from 'node:dns';

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

const EMBED_URL = process.env.LLM_EMBED_URL ?? 'http://llm-gateway-embed.workspace.svc.cluster.local:8081';
const EMBED_MODEL = 'bge-m3';

function vecLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function embedQueryText(text: string): Promise<number[]> {
  const r = await fetch(`${EMBED_URL}/v1/embeddings`, {
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

  for (const row of neighbors.rows) {
    if (existingPaths.has(row.path)) continue;
    if (augmented.length >= limit * 2) break;
    const chunkRes = await p().query(
      `SELECT chunk_index, content FROM code_embeddings WHERE file_path = $1 LIMIT 1`,
      [row.path],
    );
    if (chunkRes.rows.length > 0) {
      augmented.push({
        path: row.path,
        score: 0.7,
        snippet: chunkRes.rows[0].content.slice(0, 300),
        chunk_index: chunkRes.rows[0].chunk_index,
      });
    }
  }

  return augmented;
}
