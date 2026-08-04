// website/src/lib/codesearch-db.ts
// Shared `pool` aus website/src/lib/db-pool.ts (gehärtet: nodeLookup DNS-Workaround +
// fail-soft Connection-/Statement-Timeouts). Eigener Ad-hoc-Pool entfernt —
// siehe T001676 Stufe C1.
import pg from 'pg';
import { lookup as dnsLookup } from 'node:dns/promises';
import { pool as defaultPool } from '../db-pool';

// Test-only escape hatch: tests in codesearch-db.test.ts mocken den Pool per pg-mem.
// In Produktion wird ausschließlich `defaultPool` (aus db-pool.ts) verwendet.
let _pool: pg.Pool | undefined;
export function __setPoolForTests(testPool: pg.Pool): void { _pool = testPool; }
function p(): pg.Pool { return _pool ?? defaultPool; }

// T002317: war 'text-embedding-bge-m3'. Der Indexer schreibt mit 'bge-m3'
// (scripts/index-repo.ts) — Query- und Index-Vektoren muessen aus demselben
// Modell stammen, sonst vergleicht die Suche zwei verschiedene Vektorraeume.
const EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? 'bge-m3';
const RERANK_MODEL = process.env.LLM_RERANK_MODEL ?? 'bge-reranker-v2-m3';

// T002317: zeigte auf llm-gateway-lmstudio:1234. Diesen Service gibt es nicht
// mehr — bge-m3 zog mit T002258/T002110 auf einen eigenen llama-server um.
// In Produktion lief die Suche damit ins Leere: DNS liefert NXDOMAIN und der
// Fallback localhost:1234 existiert im Website-Pod nicht.
let _embedUrlPromise: Promise<string> | undefined;
async function resolveEmbedUrl(): Promise<string> {
  if (process.env.LLM_EMBED_URL) return process.env.LLM_EMBED_URL;
  if (!_embedUrlPromise) {
    const clusterHost = 'llm-gateway-embed.workspace.svc.cluster.local';
    _embedUrlPromise = dnsLookup(clusterHost)
      .then(() => `http://${clusterHost}:8095`)
      .catch(() => 'http://localhost:8095');
  }
  return _embedUrlPromise;
}

let _rerankUrlPromise: Promise<string> | undefined;
async function resolveRerankUrl(): Promise<string> {
  if (process.env.LLM_RERANK_URL) return process.env.LLM_RERANK_URL;
  if (!_rerankUrlPromise) {
    const clusterHost = 'llm-gateway-rerank.workspace.svc.cluster.local';
    _rerankUrlPromise = dnsLookup(clusterHost)
      .then(() => `http://${clusterHost}:8096`)
      .catch(() => 'http://localhost:8096');
  }
  return _rerankUrlPromise;
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
  /** Logit des Rerankers; fehlt, wenn der Reranker nicht erreichbar war. */
  rerank_score?: number;
}

// T002317: Wie viele Kandidaten die Vektorsuche holt, bevor der Reranker
// sortiert. Der Reranker sieht Query und Dokument gemeinsam und erkennt damit
// Bezuege, die reine Vektor-Naehe verfehlt — er kann aber nur umsortieren, was
// die erste Stufe geliefert hat. Ein grosszuegiger Faktor ist praktisch
// gratis: gemessen 2026-07-27 braucht bge-reranker-v2-m3 fuer 40 Kandidaten
// rund 0.1s.
const RERANK_CANDIDATE_FACTOR = 8;
const RERANK_MAX_CANDIDATES = 50;

async function rerank(query: string, docs: string[]): Promise<number[] | null> {
  try {
    const url = await resolveRerankUrl();
    const r = await fetch(`${url}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'query' },
      body: JSON.stringify({ model: RERANK_MODEL, query, documents: docs }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { results?: Array<{ index: number; relevance_score: number }> };
    if (!Array.isArray(j.results)) return null;
    // Auf die Eingabereihenfolge zurueckmappen: der Server liefert die Treffer
    // bereits sortiert, mit `index` als Verweis auf das Eingabedokument.
    const scores = new Array<number>(docs.length).fill(Number.NEGATIVE_INFINITY);
    for (const res of j.results) {
      if (res.index >= 0 && res.index < docs.length) scores[res.index] = res.relevance_score;
    }
    return scores;
  } catch {
    // Fail-soft (T002317): ein nicht erreichbarer Reranker darf die Suche nicht
    // abschalten. Ohne ihn bleibt das Vektor-Ranking — schlechter sortiert,
    // aber brauchbar.
    return null;
  }
}

export async function searchCode(query: string, limit = 5): Promise<CodeSearchResult[]> {
  const embedding = await embedQueryText(query);
  const candidates = Math.min(RERANK_MAX_CANDIDATES, limit * RERANK_CANDIDATE_FACTOR);
  const r = await p().query(
    `SELECT file_path, chunk_index, content,
            1 - (embedding <=> $1) AS score
       FROM code_embeddings
      ORDER BY embedding <=> $1
      LIMIT $2`,
    [vecLiteral(embedding), candidates],
  );
  const rows = r.rows.map((row: { file_path: string; chunk_index: number; content: string; score: number }) => ({
    path: row.file_path,
    score: Number(row.score),
    snippet: row.content.slice(0, 300),
    chunk_index: row.chunk_index,
    content: row.content,
  }));
  if (rows.length === 0) return [];

  const scores = await rerank(query, rows.map(x => x.content));
  const ranked = scores
    ? rows.map((x, i) => ({ ...x, rerank_score: scores[i] }))
          .sort((a, b) => b.rerank_score - a.rerank_score)
    : rows;

  return ranked.slice(0, limit).map(({ content: _content, ...rest }) => rest);
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
